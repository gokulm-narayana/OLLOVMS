/**
 * Cameras Controller
 */
app.controller('CamerasController', ['$scope', 'MockBackendService', '$document', '$timeout', '$http', function ($scope, MockBackendService, $document, $timeout, $http) {
    $scope.isLoading = true;
    $scope.dataError = false;

    $scope.allCameras = [];
    $scope.filteredCameras = [];
    $scope.paginatedCameras = [];

    // Pagination
    $scope.currentPage = 1;
    $scope.itemsPerPage = 10;
    $scope.totalItems = 0;
    $scope.paginationLabel = "Showing 0-0 of 0";

    // Filters
    $scope.filters = {
        search: '',
        status: '',
        group: '' // This maps to Location in the data
    };

    $scope.filterOptions = {
        statuses: ['Online', 'Offline', 'Warning'],
        groups: ['Building A', 'Building B', 'Parking Lot', 'Main Entrance', 'Lobby', 'Warehouse']
    };

    // Action Menu
    $scope.activeActionMenu = null; // Stores the camera ID for the open menu
    $scope.activeActionMenu = null; // Stores the camera ID for the open menu
    $scope.menuPosition = { top: '0px', left: '0px' };

    // Scanner State
    $scope.showScanner = false;
    $scope.isScanning = false;
    $scope.scanProgress = 0;
    $scope.discoveredDevices = [];

    // Authentication Modal State
    $scope.showAuthModal = false;
    $scope.isAuthenticating = false;
    $scope.authError = '';
    $scope.authForm = {
        deviceDetails: null,
        cameraName: '',
        ip: '',
        username: '',
        password: ''
    };

    $scope.init = function () {
        $scope.fetchCameras();
    };

    $scope.fetchCameras = function () {
        $scope.isLoading = true;
        MockBackendService.getCameras().then(function (cameras) {
            $scope.allCameras = cameras;
            $scope.applyFilters();
            $scope.isLoading = false;
        }, function (err) {
            console.error("Error loading cameras:", err);
            $scope.dataError = true;
            $scope.isLoading = false;
        });
    };

    $scope.applyFilters = function () {
        $scope.currentPage = 1;
        var search = $scope.filters.search.toLowerCase();

        $scope.filteredCameras = $scope.allCameras.filter(function (cam) {
            var matchesSearch = cam.name.toLowerCase().includes(search) ||
                cam.location.toLowerCase().includes(search);
            var matchesStatus = $scope.filters.status === '' || cam.status === $scope.filters.status;
            var matchesGroup = $scope.filters.group === '' || cam.location === $scope.filters.group;

            return matchesSearch && matchesStatus && matchesGroup;
        });

        $scope.totalItems = $scope.filteredCameras.length;
        $scope.updatePagination();
    };

    $scope.clearFilters = function () {
        $scope.filters = { search: '', status: '', group: '' };
        $scope.applyFilters();
    };

    $scope.updatePagination = function () {
        var start = ($scope.currentPage - 1) * $scope.itemsPerPage;
        var end = start + $scope.itemsPerPage;
        $scope.paginatedCameras = $scope.filteredCameras.slice(start, end);

        var showStart = $scope.totalItems === 0 ? 0 : start + 1;
        var showEnd = Math.min(end, $scope.totalItems);
        $scope.paginationLabel = "Showing " + showStart + "-" + showEnd + " of " + $scope.totalItems;
    };

    $scope.nextPage = function () {
        if ($scope.currentPage * $scope.itemsPerPage < $scope.totalItems) {
            $scope.currentPage++;
            $scope.updatePagination();
        }
    };

    $scope.prevPage = function () {
        if ($scope.currentPage > 1) {
            $scope.currentPage--;
            $scope.updatePagination();
        }
    };

    // --- Actions ---
    // --- Actions ---
    $scope.addCamera = function () {
        $scope.showScanner = true;
        $scope.startScanning();
    };

    $scope.startScanning = function () {
        $scope.isScanning = true;
        $scope.scanProgress = 10;
        $scope.discoveredDevices = [];

        // Ping the real API instead of simulating
        $http.get('http://localhost:5000/api/cameras/scan').then(function(response) {
            $scope.scanProgress = 100;
            $scope.isScanning = false;
            if (response.data && response.data.status === 'success') {
                $scope.discoveredDevices = response.data.data.map(function(cam, i) {
                    return {
                        id: 'discovered-' + i,
                        name: cam.name || ('ONVIF Camera ' + cam.ip),
                        ip: cam.ip,
                        type: 'ONVIF',
                        xaddrs: cam.xaddrs
                    };
                });
            } else {
                console.error("Camera scan failed or returned no data.");
            }
        }).catch(function(err) {
            $scope.scanProgress = 100;
            $scope.isScanning = false;
            console.error("Error calling camera scan API:", err);
            alert("Error communicating with backend API. Ensure python/api_server.py is running.");
        });
    };

    $scope.selectDevice = function (device) {
        var defaultPort = 80;
        if (device.xaddrs && device.xaddrs.length > 0) {
            var m = device.xaddrs[0].match(/:\/\/[^:]+:(\d+)/);
            if (m) {
                defaultPort = parseInt(m[1], 10);
            } else if (device.xaddrs[0].indexOf('https:') === 0) {
                defaultPort = 443;
            }
        }

        $scope.authForm = {
            deviceDetails: device,
            cameraName: device.name,
            ip: device.ip,
            port: defaultPort,
            username: '',
            password: ''
        };
        $scope.authError = '';
        $scope.showAuthModal = true;
    };

    $scope.closeAuthModal = function() {
        $scope.showAuthModal = false;
        $scope.isAuthenticating = false;
        $scope.authError = '';
    };

    $scope.authenticateCamera = function() {
        $scope.isAuthenticating = true;
        $scope.authError = '';
        
        var payload = {
            ip: $scope.authForm.ip,
            port: $scope.authForm.port,
            username: $scope.authForm.username,
            password: $scope.authForm.password
        };

        $http.post('http://localhost:5000/api/cameras/connect', payload).then(function(response) {
            $scope.isAuthenticating = false;
            
            if(response.data && response.data.status === 'success') {
                $scope.showAuthModal = false;
                $scope.showScanner = false;
                
                var camInfo = response.data.camera;
                
                // Build the streaming URL: Prefer RTSP for WebRTC
                var streamProxyUrl = '';
                if (camInfo.stream_url) {
                    streamProxyUrl = 'http://localhost:5000/api/cameras/stream?url=' +
                        encodeURIComponent(camInfo.stream_url);
                } else if (camInfo.snapshot_url) {
                    streamProxyUrl = 'http://localhost:5000/api/cameras/snapshot_stream?url=' +
                        encodeURIComponent(camInfo.snapshot_url) +
                        '&user=' + encodeURIComponent($scope.authForm.username) +
                        '&pass=' + encodeURIComponent($scope.authForm.password);
                }
                
                var newCam = {
                    id: 'cam-' + Date.now(),
                    name: $scope.authForm.cameraName,
                    location: 'New Location',
                    status: 'Online',
                    ip: camInfo.ip,
                    manufacturer: camInfo.manufacturer || 'Unknown',
                    model: camInfo.model || 'Unknown',
                    firmware: camInfo.firmware || 'Unknown',
                    streamUrl: streamProxyUrl,
                    webrtcPath: camInfo.webrtc_path || ('cam_' + camInfo.ip.replace(/\./g, '_')),
                    zoneConfig: { enabled: false, zones: [] }
                };
                
                // Auto-add to the list so the user doesn't have to manually save it
                $scope.$root.$broadcast('ADD_CAMERA', newCam);
                
                $scope.openCameraDetails(newCam);
            } else {
                $scope.authError = response.data.message || 'Authentication failed.';
            }
        }).catch(function(err) {
            $scope.isAuthenticating = false;
            $scope.authError = err.data && err.data.message ? err.data.message : 'Connection error occurred.';
            console.error("Authentication ERROR:", err);
        });
    };

    $scope.addManually = function () {
        $scope.showScanner = false;
        var newCam = {
            id: null,
            name: 'New Camera',
            location: 'Location',
            status: 'Offline',
            ip: '0.0.0.0',
            zoneConfig: { enabled: false, zones: [] }
        };
        $scope.openCameraDetails(newCam);
    };

    $scope.closeScanner = function () {
        $scope.showScanner = false;
    };

    $scope.openCameraDetails = function (cam) {
        $scope.$parent.activePage = 'camera-settings';
        $timeout(function () {
            $scope.$root.$broadcast('OPEN_CAMERA_SETTINGS', cam);
        }, 50);
    };


    // Action Menu Logic
    $scope.toggleActionMenu = function ($event, camera) {
        $event.stopPropagation();

        if ($scope.activeActionMenu === camera.id) {
            $scope.activeActionMenu = null;
            return;
        }

        $scope.activeActionMenu = camera.id;

        // Calculate Position
        var btn = $event.currentTarget;
        var rect = btn.getBoundingClientRect();
        var scrollY = window.pageYOffset || document.documentElement.scrollTop;
        var scrollX = window.pageXOffset || document.documentElement.scrollLeft;

        // Default to opening down-left
        var top = rect.bottom + scrollY + 5;
        var left = rect.right + scrollX - 180; // Assuming menu width ~180px

        // Determine if we should open up
        if (window.innerHeight - rect.bottom < 200) {
            top = rect.top + scrollY - 210; // Approx height
        }

        $scope.menuPosition = {
            top: top + 'px',
            left: left + 'px',
            display: 'block'
        };
    };

    $scope.closeActionMenu = function () {
        $scope.activeActionMenu = null;
    };

    // Document click to close menu
    $document.on('click', function () {
        $scope.$apply(function () {
            $scope.closeActionMenu();
        });
    });

    // Prevent menu click closing
    $scope.stopProp = function ($event) {
        $event.stopPropagation();
    };

    // Placeholder actions
    $scope.handleAction = function (action, camera) {
        console.log("Action: " + action + " on " + camera.name);
        $scope.closeActionMenu();
    };

    // --- Event Listeners ---
    $scope.$on('ADD_CAMERA', function (evt, newCam) {
        $scope.allCameras.push(newCam);
        $scope.applyFilters();
    });

    $scope.$on('UPDATE_CAMERA', function (evt, updatedCam) {
        var index = $scope.allCameras.findIndex(function (c) { return c.id === updatedCam.id; });
        if (index !== -1) {
            // Update the local data
            $scope.allCameras[index] = updatedCam;
            // Re-apply filters to update the view
            $scope.applyFilters();
        }
    });

    $scope.$on('DELETE_CAMERA', function (evt, deletedCam) {
        var index = $scope.allCameras.findIndex(function (c) { return c.id === deletedCam.id; });
        if (index !== -1) {
            // Remove from local data
            $scope.allCameras.splice(index, 1);
            // Re-apply filters
            $scope.applyFilters();
        }
    });

    // Init
    $scope.init();
}]);

/**
 * Camera Settings Controller
 * Handles the Camera Details/Edit page.
 */
app.controller('CameraSettingsController', ['$scope', '$timeout', '$document', function ($scope, $timeout, $document) {
    $scope.camera = {};
    $scope.encodeUrl = window.encodeURIComponent;
    $scope.showDeleteModal = false;
    $scope.currentView = 'live'; // Default view: 'live', 'settings', 'playback', 'zone-editor'

    // Zone Editor State
    $scope.zones = [];
    $scope.dragging = { active: false, index: null, action: null, startX: 0, startY: 0, initialZone: {} };

    $scope.$on('OPEN_CAMERA_SETTINGS', function (evt, cam) {
        $scope.camera = angular.copy(cam);
        $scope.isNewCamera = !cam.id;
        $scope.showDeleteModal = false;
        $scope.currentView = 'live'; // Reset to live view on open

        // Initialize zones from camera config or default
        if ($scope.camera.zoneConfig && $scope.camera.zoneConfig.zones) {
            $scope.zones = angular.copy($scope.camera.zoneConfig.zones);
        } else {
            $scope.zones = [];
        }

        // Live View State
        $scope.liveStats = { fps: 30, bitrate: 4500 };
        $scope.isRecording = false; // Manual recording state
        $scope.isAudioOn = false;
        $scope.showPTZ = false;

        $timeout(function() {
            if ($scope.currentView === 'live') {
                $scope.startWebRTC('liveVideoPlayer');
            }
        }, 300);
    });

    $scope.startWebRTC = function(videoId) {
        var webrtcPath = $scope.camera.webrtcPath || ($scope.camera.ip ? 'cam_' + $scope.camera.ip.replace(/\./g, '_') : null);
        if (!webrtcPath) return;
        
        if (window.currentWebrtcPc) {
            window.currentWebrtcPc.close();
            window.currentWebrtcPc = null;
        }
        
        var pc = new RTCPeerConnection();
        window.currentWebrtcPc = pc;

        var videoElem = document.getElementById(videoId);
        if (!videoElem) {
            $timeout(function() { $scope.startWebRTC(videoId); }, 100);
            return;
        }

        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });

        pc.ontrack = function(event) {
            if (videoElem.srcObject !== event.streams[0]) {
                videoElem.srcObject = event.streams[0];
            }
        };

        pc.createOffer().then(function(offer) {
            return pc.setLocalDescription(offer);
        }).then(function() {
            return fetch('http://localhost:8889/' + webrtcPath + '/whep', {
                method: 'POST',
                body: pc.localDescription.sdp,
                headers: { 'Content-Type': 'application/sdp' }
            });
        }).then(function(response) {
            if (!response.ok) throw new Error('WHEP offer rejected');
            return response.text();
        }).then(function(answer) {
            return pc.setRemoteDescription({ type: 'answer', sdp: answer });
        }).catch(function(err) {
            console.error('WebRTC WHEP negotiation failed:', err);
        });
    };

    $scope.$on('$destroy', function() {
        if (window.currentWebrtcPc) {
            window.currentWebrtcPc.close();
            window.currentWebrtcPc = null;
        }
    });

    // --- Live View Controls ---
    $scope.toggleRecording = function () {
        $scope.isRecording = !$scope.isRecording;
        if ($scope.isRecording) {
            console.log("Manual recording started for " + $scope.camera.name);
        } else {
            console.log("Manual recording stopped.");
        }
    };

    $scope.takeSnapshot = function () {
        console.log("Snapshot taken for " + $scope.camera.name);
        // Simulation feedback
        var btn = document.activeElement;
        if (btn) {
            btn.style.transform = "scale(0.9)";
            setTimeout(function () { btn.style.transform = ""; }, 100);
        }
    };

    $scope.toggleAudio = function () {
        $scope.isAudioOn = !$scope.isAudioOn;
        var video = document.getElementById('liveVideoPlayer');
        if (video) {
            video.muted = !$scope.isAudioOn;
        }
    };

    $scope.togglePTZ = function () {
        $scope.showPTZ = !$scope.showPTZ;
    };

    $scope.ptzMove = function (direction) {
        console.log("PTZ Move: " + direction);
        // In a real app, this would send a command to the backend
    };

    $scope.ptzStop = function () {
        console.log("PTZ Stop");
    };

    $scope.ptzHome = function () {
        console.log("PTZ Home");
    };

    $scope.toggleFullscreen = function () {
        var elem = document.querySelector('.live-view-container');
        if (!document.fullscreenElement) {
            if (elem.requestFullscreen) {
                elem.requestFullscreen();
            } else if (elem.webkitRequestFullscreen) { /* Safari */
                elem.webkitRequestFullscreen();
            } else if (elem.msRequestFullscreen) { /* IE11 */
                elem.msRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }
    };

    $scope.setView = function (viewName) {
        $scope.currentView = viewName;
        if (viewName === 'live') {
            $timeout(function() { $scope.startWebRTC('liveVideoPlayer'); }, 100);
        } else if (viewName === 'zone-editor') {
            $timeout(function() { $scope.startWebRTC('zoneVideoPlayer'); }, 100);
        } else {
            if (window.currentWebrtcPc) {
                window.currentWebrtcPc.close();
                window.currentWebrtcPc = null;
            }
        }
    };

    // Settings Tab State
    $scope.activeSettingsTab = 'general'; // 'general', 'detections', 'privacy'
    $scope.setSettingsTab = function (tab) {
        $scope.activeSettingsTab = tab;
    };

    $scope.addToMultiview = function () {
        console.log("Adding to multiview:", $scope.camera.name);
        // Broadcast event to Multiview Controller
        $scope.$root.$broadcast('ADD_TO_MULTIVIEW', $scope.camera);
        // Navigate to Multiview page
        $scope.$parent.activePage = 'multiview';
    };

    // Zone Editor State
    $scope.zones = [];
    $scope.dragging = { active: false, index: null, action: null, startX: 0, startY: 0, initialZone: {} };

    // ... (setView, addToMultiview remain same)

    $scope.handleAction = function (action) {
        console.log(action + " " + $scope.camera.name);

        if (action === 'Delete') {
            $scope.showDeleteModal = true;
        } else if (action === 'Settings') {
            $scope.setView('settings');
        } else if (action === 'Multiview') {
            $scope.addToMultiview();
        } else if (action === 'View Live') {
            $scope.setView('live');
        } else if (action === 'Playback') {
            $scope.setView('playback');
        } else if (action === 'Restart') {
            alert("Restarting Camera...");
        } else if (action === 'Configure Zone') {
            // Configure Privacy Masks
            $scope.setView('zone-editor');
            // Load existing masks
            $scope.zones = angular.copy($scope.camera.zoneConfig && $scope.camera.zoneConfig.zones ? $scope.camera.zoneConfig.zones : []);
            if ($scope.zones.length === 0) $scope.addZone();
        }
    };

    $scope.confirmDelete = function () {
        $scope.$root.$broadcast('DELETE_CAMERA', $scope.camera);
        $scope.showDeleteModal = false;
        $scope.goBack();
    };

    $scope.cancelDelete = function () {
        $scope.showDeleteModal = false;
    };

    // --- Custom Action Confirmation Logic ---
    $scope.showConfirmModal = false;
    $scope.confirmTitle = '';
    $scope.confirmMessage = '';
    $scope.pendingAction = null;

    $scope.confirmAction = function (title, message, callback) {
        $scope.confirmTitle = title;
        $scope.confirmMessage = message;
        $scope.pendingAction = callback;
        $scope.showConfirmModal = true;
    };

    $scope.executeAction = function () {
        if ($scope.pendingAction) {
            $scope.pendingAction();
        }
        $scope.cancelAction();
    };

    $scope.cancelAction = function () {
        $scope.showConfirmModal = false;
        $scope.pendingAction = null;
    };

    // --- Actions ---
    $scope.saveSettings = function () {
        $scope.confirmAction(
            "Save Changes",
            "Are you sure you want to save these changes?",
            function () {
                console.log("Saving Settings for " + $scope.camera.name);

                if ($scope.isNewCamera) {
                    // Generate ID
                    $scope.camera.id = 'cam-' + Date.now();
                    $scope.camera.status = 'Online'; // Simulate coming online
                    $scope.$root.$broadcast('ADD_CAMERA', $scope.camera); // Need to handle this in parent/list
                } else {
                    $scope.$root.$broadcast('UPDATE_CAMERA', $scope.camera);
                }

                $scope.goBack(); // Return to list after save
            }
        );
    };

    // --- Zone Editor Logic ---
    $scope.addZone = function () {
        // Add a default centered zone (percent based)
        $scope.zones.push({
            x: 30, y: 30, w: 40, h: 40
        });
    };

    $scope.removeZone = function (index) {
        $scope.zones.splice(index, 1);
    };

    $scope.saveZones = function () {
        // Save zones to camera config
        if (!$scope.camera.zoneConfig) $scope.camera.zoneConfig = {};
        $scope.camera.zoneConfig.zones = angular.copy($scope.zones);
        $scope.camera.zoneConfig.enabled = $scope.zones.length > 0;

        // Persist
        $scope.$root.$broadcast('UPDATE_CAMERA', $scope.camera);
        $scope.setView('settings');
    };

    // Mouse Interaction
    $scope.onZoneMouseDown = function ($event, index, action) {
        $event.preventDefault();
        $event.stopPropagation();

        $scope.dragging = {
            active: true,
            index: index,
            action: action,
            startX: $event.clientX,
            startY: $event.clientY,
            initialZone: angular.copy($scope.zones[index]),
            containerRect: document.getElementById('zoneEditorArea').getBoundingClientRect()
        };
    };

    $scope.onZoneMouseMove = function ($event) {
        if (!$scope.dragging.active) return;

        var d = $scope.dragging;
        var zone = $scope.zones[d.index];
        var deltaX = $event.clientX - d.startX;
        var deltaY = $event.clientY - d.startY;

        // Convert px delta to percentage
        var deltaXPercent = (deltaX / d.containerRect.width) * 100;
        var deltaYPercent = (deltaY / d.containerRect.height) * 100;

        if (d.action === 'move') {
            zone.x = Math.max(0, Math.min(100 - zone.w, d.initialZone.x + deltaXPercent));
            zone.y = Math.max(0, Math.min(100 - zone.h, d.initialZone.y + deltaYPercent));
        } else if (d.action === 'se') {
            zone.w = Math.max(5, Math.min(100 - zone.x, d.initialZone.w + deltaXPercent));
            zone.h = Math.max(5, Math.min(100 - zone.y, d.initialZone.h + deltaYPercent));
        } else if (d.action === 'sw') {
            var newW = d.initialZone.w - deltaXPercent;
            var newX = d.initialZone.x + deltaXPercent;
            if (newW >= 5 && newX >= 0) {
                zone.w = newW;
                zone.x = newX;
            }
            zone.h = Math.max(5, Math.min(100 - zone.y, d.initialZone.h + deltaYPercent));
        } else if (d.action === 'ne') {
            zone.w = Math.max(5, Math.min(100 - zone.x, d.initialZone.w + deltaXPercent));
            var newH = d.initialZone.h - deltaYPercent;
            var newY = d.initialZone.y + deltaYPercent;
            if (newH >= 5 && newY >= 0) {
                zone.h = newH;
                zone.y = newY;
            }
        } else if (d.action === 'nw') {
            var newW = d.initialZone.w - deltaXPercent;
            var newX = d.initialZone.x + deltaXPercent;
            if (newW >= 5 && newX >= 0) {
                zone.w = newW;
                zone.x = newX;
            }
            var newH = d.initialZone.h - deltaYPercent;
            var newY = d.initialZone.y + deltaYPercent;
            if (newH >= 5 && newY >= 0) {
                zone.h = newH;
                zone.y = newY;
            }
        } else if (d.action === 'n') {
            var newH = d.initialZone.h - deltaYPercent;
            var newY = d.initialZone.y + deltaYPercent;
            if (newH >= 5 && newY >= 0) {
                zone.h = newH;
                zone.y = newY;
            }
        } else if (d.action === 's') {
            zone.h = Math.max(5, Math.min(100 - zone.y, d.initialZone.h + deltaYPercent));
        } else if (d.action === 'w') {
            var newW = d.initialZone.w - deltaXPercent;
            var newX = d.initialZone.x + deltaXPercent;
            if (newW >= 5 && newX >= 0) {
                zone.w = newW;
                zone.x = newX;
            }
        } else if (d.action === 'e') {
            zone.w = Math.max(5, Math.min(100 - zone.x, d.initialZone.w + deltaXPercent));
        }
    };

    $scope.onZoneMouseUp = function () {
        $scope.dragging.active = false;
    };

    // Global mouse up to catch dragging outside
    $document.on('mouseup', function () {
        if ($scope.dragging.active) {
            $scope.onZoneMouseUp();
            $scope.$apply(); // Trigger digest since this is outside angular context
        }
    });

    $scope.saveAndRestart = function () {
        $scope.confirmAction(
            "Save & Restart",
            "Are you sure you want to save changes AND restart the camera? The stream will be interrupted.",
            function () {
                console.log("Saving & Restarting " + $scope.camera.name);
                // 1. Save
                $scope.$root.$broadcast('UPDATE_CAMERA', $scope.camera);

                // 2. Restart Simulation
                console.log("System: Settings Saved. Restarting Camera...");

                // 3. Return to Live
                $scope.setView('live');
            }
        );
    };

    $scope.goBack = function () {
        $scope.$parent.activePage = 'cameras';
    };
}]);



/**
 * Playback Controller
 * Handles the single camera playback interface.
 */
app.controller('PlaybackController', ['$scope', '$interval', '$timeout', '$document', function ($scope, $interval, $timeout, $document) {
    // --- State ---
    $scope.isPlaying = true;
    $scope.playbackSpeed = 1;
    $scope.currentPlaybackTime = new Date();
    $scope.scrubberPosition = 50; // Percentage (0-100)

    $scope.isScrubbing = false;

    // --- Data State ---
    $scope.selectedDate = new Date();
    $scope.timelineEvents = [];
    $scope.historyDates = [];
    $scope.showDateDropdown = false;

    // Generate last 10 days
    var generateHistoryDates = function () {
        var dates = [];
        var today = new Date();
        for (var i = 0; i < 10; i++) {
            var d = new Date(today);
            d.setDate(today.getDate() - i);
            dates.push(d);
        }
        $scope.historyDates = dates;
    };
    generateHistoryDates(); // Run on init

    $scope.generateEvents = function (date) {
        $scope.timelineEvents = [];
        // No mock events generated
    };

    $scope.toggleDateDropdown = function ($event) {
        $event.stopPropagation();
        $scope.showDateDropdown = !$scope.showDateDropdown;
    };

    $scope.selectDate = function (date) {
        $scope.selectedDate = date;
        $scope.showDateDropdown = false;
        $scope.generateEvents($scope.selectedDate);

        // Reset playback to start
        $scope.scrubberPosition = 0;
        $scope.currentPlaybackTime = angular.copy($scope.selectedDate);
        $scope.currentPlaybackTime.setHours(9, 0, 0, 0);
        $scope.scrubberPosition = (9 / 24) * 100;
    };

    // Close dropdown on click outside
    var closeDropdown = function () {
        if ($scope.showDateDropdown) {
            $scope.$apply(function () {
                $scope.showDateDropdown = false;
            });
        }
    };
    $document.on('click', closeDropdown);

    // Cleanup
    $scope.$on('$destroy', function () {
        $document.off('click', closeDropdown);
        if (angular.isDefined(stopTime)) {
            $interval.cancel(stopTime);
            stopTime = undefined;
        }
    });

    // --- Init ---
    $timeout(function () {
        var video = document.getElementById('playbackPlayer');
        if (video && $scope.isPlaying) {
            video.play().catch(function (e) {
                console.error("Autoplay failed:", e);
            });
        }
        $scope.generateEvents($scope.selectedDate);
    }, 500);

    // --- Controls ---
    $scope.togglePlayback = function () {
        $scope.isPlaying = !$scope.isPlaying;
        // Use timeout or check document dynamically as ng-if might delay DOM
        $timeout(function () {
            var video = document.getElementById('playbackPlayer');
            if (video) {
                if ($scope.isPlaying) video.play();
                else video.pause();
            } else {
                console.warn("Playback player not found");
            }
        });
    };

    $scope.changeSpeed = function () {
        var speeds = [0.5, 1, 2, 4, 8];
        var idx = speeds.indexOf($scope.playbackSpeed);
        $scope.playbackSpeed = speeds[(idx + 1) % speeds.length];

        $timeout(function () {
            var video = document.getElementById('playbackPlayer');
            if (video) video.playbackRate = $scope.playbackSpeed;
        });
    };

    $scope.skip = function (seconds) {
        $scope.currentPlaybackTime = new Date($scope.currentPlaybackTime.getTime() + (seconds * 1000));
        // Simulate scrubber move for demo
        $scope.scrubberPosition = Math.min(100, Math.max(0, $scope.scrubberPosition + (seconds / 100)));
    };

    // --- Timeline Logic ---
    $scope.onTimelineMouseDown = function ($event) {
        $scope.isScrubbing = true;
        // Calculate position
        $scope.updateScrubber($event);
    };

    $scope.onTimelineMouseMove = function ($event) {
        if ($scope.isScrubbing) {
            $scope.updateScrubber($event);
        }
    };

    $scope.onTimelineMouseUp = function ($event) {
        $scope.isScrubbing = false;
    };

    $scope.updateScrubber = function ($event) {
        var timeline = document.getElementById('timelineContainer');
        if (!timeline) return;

        var rect = timeline.getBoundingClientRect();
        var x = $event.clientX - rect.left;
        var percentage = (x / rect.width) * 100;

        // Clamp 0-100
        $scope.scrubberPosition = Math.min(100, Math.max(0, percentage));

        // Update mock timestamp
        // Assume timeline is 24 hours (86400 seconds)
        // This is purely visual simulation
    };

    // Simulation Loop
    var stopTime = $interval(function () {
        if ($scope.isPlaying && !$scope.isScrubbing) {
            $scope.scrubberPosition += (0.05 * $scope.playbackSpeed);
            if ($scope.scrubberPosition >= 100) $scope.scrubberPosition = 0;

            // Advance time
            $scope.currentPlaybackTime = new Date($scope.currentPlaybackTime.getTime() + 1000 * $scope.playbackSpeed);
        }
    }, 1000);

    $scope.$on('$destroy', function () {
        if (angular.isDefined(stopTime)) {
            $interval.cancel(stopTime);
            stopTime = undefined;
        }
    });
}]);
