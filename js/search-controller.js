/**
 * Search Controller
 * Handles the Search page which contains tabs for "Nura AI" and "Object Search"
 */
app.controller('SearchController', ['$scope', '$sce', 'MockBackendService', function ($scope, $sce, MockBackendService) {

    // Manage tabs: 'nura-ai' or 'object-search'
    $scope.activeSearchTab = 'nura-ai';

    $scope.setSearchTab = function (tab) {
        $scope.activeSearchTab = tab;
    };

    // --- Object Search Logic ---

    $scope.isFilterPanelOpen = true;

    $scope.toggleFilterPanel = function () {
        $scope.isFilterPanelOpen = !$scope.isFilterPanelOpen;
    };

    $scope.getTranslationKey = function (str) {
        if (!str) return '';
        return str.toLowerCase().replace(/ /g, '_').replace(/\//g, '').replace(/__/g, '_');
    };

    $scope.searchParams = {
        category: 'Person',
        objectType: 'Person',
        color: '', // Can be a preset name like 'Red' or a custom hex like '#ff00ff'
        customColorHex: '#ff0000', // Intermediate holding value for the native color picker
        vehicleType: '',
        attributes: { // Kept for legacy compatibility if we want generic attributes
            hat: false, backpack: false, glasses: false, mask: false
        },
        ppeAttributes: {
            helmet: false, safetyVest: false, hardhat: false, mask: false, respirator: false
        },
        licensePlate: '',
        gender: '',
        ageGroup: '',
        speed: '',
        dwellTime: '',
        savedSearch: '',
        cameras: [],
        timeRange: 'last24h'
    };

    $scope.options = {
        categories: [
            'Person',
            'Vehicles',
            'Bags',
            'Protective Gear',
            'Dangerous Goods'
        ],
        categoryObjects: {
            'Vehicles': ['Vehicle', 'License Plate'],
            'Person': ['Person', 'Face'],
            'Protective Gear': [], // No target objects, just checkboxes
            'Bags': ['Backpack', 'Handbag', 'Suitcase', 'Parcel / Box', 'Tool Bag'],
            'Dangerous Goods': ['Fire', 'Smoke', 'Gas Cylinder', 'Fuel Can', 'Spill / Puddle', 'Gun', 'Knife / Blade', 'Axe / Hatchet', 'Club / Bat / Rod', 'Hammer', 'Crowbar / Prybar', 'Bolt Cutter', 'Power Tool']
        },
        colors: [
            { name: 'Red', hex: '#ef4444' },
            { name: 'Blue', hex: '#3b82f6' },
            { name: 'White', hex: '#ffffff' },
            { name: 'Black', hex: '#111827' },
            { name: 'Silver', hex: '#9ca3af' },
            { name: 'Green', hex: '#22c55e' }
        ],
        vehicleTypes: ['All Vehicles', 'Car', 'Motorcycle', 'Bicycle', 'Bus', 'Truck', 'Van', 'Autorickshaw'],
        timeRanges: [
            { val: 'lasthour', label: 'Last Hour' },
            { val: 'last24h', label: 'Last 24 Hours' },
            { val: 'week', label: 'Past Week' },
            { val: 'custom', label: 'Custom Range...' }
        ],
        savedSearches: [
            { id: 's1', name: 'High Confidence Vehicles' },
            { id: 's2', name: 'Lobby Loitering > 30s' },
            { id: 's3', name: 'Red Trucks Last 24h' }
        ]
    };

    // Load Saved Search
    $scope.loadSavedSearch = function () {
        if (!$scope.searchParams.savedSearch) {
            $scope.resetSearch();
            return;
        }

        // Mock loading predefined setups
        if ($scope.searchParams.savedSearch === 's1') {
            $scope.resetSearch();
            $scope.searchParams.objectType = 'Vehicle';
            $scope.searchParams.confidence = 95;
            $scope.searchParams.savedSearch = 's1';
        } else if ($scope.searchParams.savedSearch === 's2') {
            $scope.resetSearch();
            $scope.searchParams.objectType = 'Person';
            $scope.searchParams.dwellTime = '30';
            $scope.searchParams.savedSearch = 's2';
            // Assuming Lobby Cam has id 2
            $scope.searchParams.cameras = [2];
        } else if ($scope.searchParams.savedSearch === 's3') {
            $scope.resetSearch();
            $scope.searchParams.objectType = 'Vehicle';
            $scope.searchParams.vehicleType = 'Truck';
            $scope.searchParams.color = 'Red';
            $scope.searchParams.savedSearch = 's3';
        }
    };

    // Category Change Handler
    $scope.onCategoryChange = function (category) {
        $scope.searchParams.category = category;
        $scope.searchParams.objectType = $scope.options.categoryObjects[category][0];
        $scope.isFilterPanelOpen = true;
    };

    // Color Handlers
    $scope.setSearchColor = function (colorName) {
        $scope.searchParams.color = colorName;
    };

    $scope.onCustomColorChange = function () {
        // When the user picks a color from the native picker, set it as the active color
        $scope.searchParams.color = $scope.searchParams.customColorHex;
    };

    $scope.clearColor = function () {
        $scope.searchParams.color = '';
    };

    $scope.isCustomColorSelected = function () {
        if (!$scope.searchParams.color) return false;
        // It is custom if it's NOT in the predefined list
        const isPredefined = $scope.options.colors.some(c => c.name === $scope.searchParams.color);
        return !isPredefined;
    };

    $scope.availableCameras = [];
    MockBackendService.getCameras().then(function (cams) {
        if (cams && cams.length > 0) {
            $scope.availableCameras = cams;
        } else {
            // No cameras from backend
            $scope.availableCameras = [];
        }
    });

    $scope.isCameraDropdownOpen = false;
    $scope.isAttributesDropdownOpen = false;
    $scope.isSavedSearchesDropdownOpen = false;
    $scope.isTargetObjectDropdownOpen = false;

    $scope.toggleSavedSearchesDropdown = function (event) {
        if (event) event.stopPropagation();
        $scope.isSavedSearchesDropdownOpen = !$scope.isSavedSearchesDropdownOpen;
    };

    $scope.toggleTargetObjectDropdown = function (event) {
        if (event) event.stopPropagation();
        $scope.isTargetObjectDropdownOpen = !$scope.isTargetObjectDropdownOpen;
    };

    $scope.selectTargetObject = function (obj) {
        $scope.searchParams.objectType = obj;
        $scope.isTargetObjectDropdownOpen = false;
    };

    $scope.getTargetObjectIcon = function (objName) {
        const iconMap = {
            'Person':           'accessibility_new',
            'Face':             'face',
            'Vehicle':          'directions_car',
            'License Plate':    'pin',
            'Backpack':         'backpack',
            'Handbag':          'shopping_bag',
            'Suitcase':         'luggage',
            'Parcel / Box':     'inventory_2',
            'Tool Bag':         'home_repair_service',
            'Fire':             'local_fire_department',
            'Smoke':            'cloud',
            'Gas Cylinder':     'propane',
            'Fuel Can':         'local_gas_station',
            'Spill / Puddle':   'water_drop',
            'Gun':              'sports_handball',
            'Knife / Blade':    'content_cut',
            'Axe / Hatchet':    'hardware',
            'Club / Bat / Rod': 'sports_cricket',
            'Hammer':           'hardware',
            'Crowbar / Prybar': 'build',
            'Bolt Cutter':      'handyman',
            'Power Tool':       'electric_bolt'
        };
        return iconMap[objName] || 'category';
    };

    $scope.getTargetObjectColor = function (objName) {
        const colorMap = {
            'Person':           '#4FC3F7',  // light blue
            'Face':             '#F48FB1',  // pink
            'Vehicle':          '#81C784',  // green
            'License Plate':    '#7986CB',  // indigo
            'Backpack':         '#FFB74D',  // orange
            'Handbag':          '#CE93D8',  // purple
            'Suitcase':         '#A1887F',  // brown
            'Parcel / Box':     '#FFD54F',  // amber
            'Tool Bag':         '#90A4AE',  // blue-grey
            'Fire':             '#FF5722',  // deep orange
            'Smoke':            '#B0BEC5',  // grey
            'Gas Cylinder':     '#4DD0E1',  // cyan
            'Fuel Can':         '#FF8A65',  // orange
            'Spill / Puddle':   '#29B6F6',  // blue
            'Gun':              '#EF5350',  // red
            'Knife / Blade':    '#E53935',  // dark red
            'Axe / Hatchet':    '#8D6E63',  // brown
            'Club / Bat / Rod': '#66BB6A',  // green
            'Hammer':           '#78909C',  // grey
            'Crowbar / Prybar': '#546E7A',  // blue-grey
            'Bolt Cutter':      '#FFA726',  // amber
            'Power Tool':       '#42A5F5'   // blue
        };
        return colorMap[objName] || 'var(--text-secondary)';
    };

    $scope.getSelectedTargetObjectText = function () {
        if (!$scope.searchParams.objectType) return $scope.translations && $scope.translations.search ? $scope.translations.search.target_object : "Select Object";
        return ($scope.translations && $scope.translations.search ? $scope.translations.search[$scope.getTranslationKey($scope.searchParams.objectType)] : null) || $scope.searchParams.objectType;
    };

    $scope.getSelectedSavedSearchText = function () {
        if (!$scope.searchParams.savedSearch) return "Saved Searches";
        const search = $scope.options.savedSearches.find(s => s.id === $scope.searchParams.savedSearch);
        return search ? search.name : "Saved Searches";
    };

    $scope.selectSavedSearch = function (searchId) {
        $scope.searchParams.savedSearch = searchId;
        $scope.isSavedSearchesDropdownOpen = false;
        $scope.loadSavedSearch();
    };

    $scope.toggleAttributesDropdown = function (event) {
        if (event) event.stopPropagation();
        $scope.isAttributesDropdownOpen = !$scope.isAttributesDropdownOpen;
    };

    $scope.getSelectedAttributesText = function () {
        const attrs = $scope.searchParams.attributes;
        const selected = [];
        if (attrs.hat) selected.push("Hat");
        if (attrs.backpack) selected.push("Backpack");
        if (attrs.glasses) selected.push("Glasses");
        if (attrs.mask) selected.push("Mask");

        if (selected.length === 0) return "Any Attribute";
        if (selected.length === 1) return selected[0];
        return selected.length + " Attributes";
    };

    $scope.isPPEDropdownOpen = false;

    $scope.togglePPEDropdown = function (event) {
        if (event) event.stopPropagation();
        $scope.isPPEDropdownOpen = !$scope.isPPEDropdownOpen;
    };

    $scope.getSelectedPPEText = function () {
        const ppe = $scope.searchParams.ppeAttributes;
        const selected = [];
        if (ppe.helmet) selected.push("Helmet");
        if (ppe.safetyVest) selected.push("Safety Vest");
        if (ppe.hardhat) selected.push("Hardhat");
        if (ppe.mask) selected.push("Mask");
        if (ppe.respirator) selected.push("Respirator");

        if (selected.length === 0) return "Any Protective Gear";
        if (selected.length === 1) return selected[0];
        return selected.length + " Items";
    };

    // --- Loitering / Dwell Time Slider Logic ---
    $scope.searchParams.dwellTimeSlider = 0; // 0 to 100
    $scope.searchParams.dwellTimeFormatted = "Any";
    $scope.searchParams.dwellTimeSeconds = 0;

    // We want a range from ~5 seconds up to ~7 days (604,800 seconds)
    // We'll use a logarithmic scale to make the lower end more granular
    $scope.updateDwellTime = function () {
        const val = $scope.searchParams.dwellTimeSlider;
        if (val == 0) {
            $scope.searchParams.dwellTimeFormatted = "Any";
            $scope.searchParams.dwellTimeSeconds = 0;
            return;
        }

        // Logarithmic formula: Time = base ^ (val * multiplier) - offset
        // We want val=1 -> 5s, val=100 -> ~604,800s (7 days)
        const minTime = 5;
        const maxTime = 604800;

        // Map 1-100 to a logarithmic scale
        const minLog = Math.log(minTime);
        const maxLog = Math.log(maxTime);
        const scale = (maxLog - minLog) / 99; // 99 steps between 1 and 100

        const seconds = Math.round(Math.exp(minLog + scale * (val - 1)));
        $scope.searchParams.dwellTimeSeconds = seconds;
        $scope.searchParams.dwellTimeFormatted = $scope.formatDwellTime(seconds);
    };

    $scope.formatDwellTime = function (totalSeconds) {
        if (totalSeconds < 60) return "> " + totalSeconds + "sec";
        if (totalSeconds < 3600) return "> " + Math.round(totalSeconds / 60) + "min";
        if (totalSeconds < 86400) {
            const hrs = Math.floor(totalSeconds / 3600);
            return hrs === 1 ? "> 1 hour" : "> " + hrs + " hours";
        }
        const days = Math.round(totalSeconds / 86400);
        return days === 1 ? "> 1 day" : "> " + days + " days";
    };


    $scope.toggleCameraDropdown = function (event) {
        if (event) event.stopPropagation();
        $scope.isCameraDropdownOpen = !$scope.isCameraDropdownOpen;
    };

    // Close dropdowns on outside click
    document.addEventListener('click', function (e) {
        $scope.$applyAsync(function () {
            if ($scope.isCameraDropdownOpen) {
                $scope.isCameraDropdownOpen = false;
            }
            if ($scope.isAttributesDropdownOpen) {
                $scope.isAttributesDropdownOpen = false;
            }
            if ($scope.isPPEDropdownOpen) {
                $scope.isPPEDropdownOpen = false;
            }
            if ($scope.isSavedSearchesDropdownOpen) {
                $scope.isSavedSearchesDropdownOpen = false;
            }
            if ($scope.isTargetObjectDropdownOpen) {
                $scope.isTargetObjectDropdownOpen = false;
            }
        });
    });

    $scope.toggleCameraSelection = function (camId) {
        const idx = $scope.searchParams.cameras.indexOf(camId);
        if (idx > -1) {
            $scope.searchParams.cameras.splice(idx, 1);
        } else {
            $scope.searchParams.cameras.push(camId);
        }
    };

    $scope.isCameraSelected = function (camId) {
        return $scope.searchParams.cameras.indexOf(camId) > -1;
    };

    $scope.getSelectedCamerasText = function () {
        if (!$scope.searchParams.cameras || $scope.searchParams.cameras.length === 0) {
            return "All Cameras";
        }
        if ($scope.searchParams.cameras.length === 1) {
            const camId = $scope.searchParams.cameras[0];
            const cam = $scope.availableCameras.find(c => c.id === camId);
            return cam ? cam.name : "1 Selected";
        }
        if ($scope.searchParams.cameras.length === $scope.availableCameras.length) {
            return "All Cameras";
        }
        return $scope.searchParams.cameras.length + " Cameras Selected";
    };

    $scope.searchResults = null;
    $scope.isSearching = false;

    $scope.executeSearch = function () {
        $scope.isSearching = true;
        $scope.searchResults = [];

        // Simulate backend processing
        setTimeout(function () {
            $scope.$apply(function () {
                $scope.isSearching = false;

                // Automatically hide the filter panel to show results in full screen
                $scope.isFilterPanelOpen = false;

                // MOCK RESULTS with varied dummy data
                let tagBase = ($scope.searchParams.color || '') + ' ' + $scope.searchParams.objectType;
                let specificTag = $scope.searchParams.vehicleType ? `${tagBase} (${$scope.searchParams.vehicleType})` : tagBase;

                $scope.searchResults = [];
            });
        }, 1500);
    };

    $scope.resetSearch = function () {
        $scope.searchParams = {
            category: 'People / Vehicles',
            objectType: 'Person',
            color: '',
            customColorHex: '#ff0000',
            vehicleType: '',
            attributes: { hat: false, backpack: false, glasses: false, mask: false },
            ppeAttributes: { helmet: false, safetyVest: false, hardhat: false, mask: false, respirator: false },
            licensePlate: '',
            gender: '',
            ageGroup: '',
            speed: '',
            dwellTime: '',
            savedSearch: '',
            cameras: [],
            timeRange: 'last24h'
        };
        $scope.searchResults = null;
    };

    $scope.openResultVideo = function (result) {
        alert("Opening video player for: " + result.cameraName + " at " + new Date(result.timestamp).toLocaleTimeString());
        // Here we would typically jump to the playback interface
    };
}]);
