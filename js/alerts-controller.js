/**
 * Alerts Controller
 * Handles the logic for the Alerts Page as per SRS.
 */
app.controller('AlertsController', ['$scope', 'MockBackendService', '$interval', 'KafkaService', '$timeout', function ($scope, MockBackendService, $interval, KafkaService, $timeout) {

    // --- State ---
    $scope.isLoading = true;
    $scope.allAlerts = [];
    $scope.filteredAlerts = [];
    $scope.paginatedAlerts = [];
    $scope.liveAlerts = []; // Store real-time alerts permanently

    // Pagination
    $scope.pagination = {
        currentPage: 1,
        itemsPerPage: 15,
        totalItems: 0,
        label: "Showing 0-0 of 0"
    };

    // Filters Model
    $scope.filters = {
        search: '',
        severity: '', // '', 'Critical', 'High', 'Medium', 'Low'
        status: 'Unread', // 'All', 'Unread', 'Resolved', 'Deleted'
        location: '', // New Location Filter
        timeRange: '24h', // '15m', '1h', '4h', '24h', 'today', 'yesterday', '7d', '30d', 'custom'
        customStart: null,
        customEnd: null
    };

    // Options for Selects
    $scope.options = {
        severities: ['Critical', 'High', 'Medium', 'Low'],
        statuses: ['Unread', 'All', 'Resolved', 'Deleted'],
        locations: [], // Populated from backend
        timeRanges: [
            { label: 'Last 15 Minutes', val: '15m' },
            { label: 'Last 1 Hour', val: '1h' },
            { label: 'Last 4 Hours', val: '4h' },
            { label: 'Last 24 Hours', val: '24h' },
            { label: 'Today', val: 'today' },
            { label: 'Yesterday', val: 'yesterday' },
            { label: 'Last 7 Days', val: '7d' },
            { label: 'Last 30 Days', val: '30d' },
            { label: 'Custom Range', val: 'custom' }
        ]
    };

    // --- Stats ---
    $scope.stats = { unread: 0, critical: 0 };

    // --- UI State ---
    $scope.activeActionMenu = false;
    $scope.activeActionAlert = null;
    $scope.menuPosition = {};

    // --- Init ---
    $scope.init = function () {
        console.log("Initializing Alerts Page...");
        $scope.fetchLocations();
        $scope.fetchAlerts();

        // --- Kafka Subscription ---
        KafkaService.subscribe('alerts', function (alertPayload) {
            console.log("AlertsController: Received Real-Time Alert:", alertPayload);

            // Use $timeout to safely wrap 
            $timeout(function () {
                // Add new alert to the top of the list
                $scope.liveAlerts.unshift(alertPayload);
                // Update filtered view (assume new alert matches, or we could filter it)
                $scope.filteredAlerts.unshift(alertPayload);
                // Also update stats
                if (alertPayload.status === 'Unread') $scope.stats.unread++;
                if (alertPayload.severity === 'Critical') $scope.stats.critical++;

                $scope.updatePagination();
            });
        });

        // Listen for Initial Alerts Dump
        KafkaService.subscribe('initial_alerts', function (alertsPayload) {
            console.log("AlertsController: Received Initial Alerts:", alertsPayload);
            $timeout(function () {
                $scope.liveAlerts = alertsPayload; // Replace or merge
                $scope.filteredAlerts = alertsPayload;
                $scope.updatePagination();
                $scope.updateStats();
                $scope.isLoading = false;
            });
        });

        $scope.$on('$destroy', function () {
            if ($scope.refreshInterval) $interval.cancel($scope.refreshInterval);
        });
    };

    $scope.fetchLocations = function () {
        MockBackendService.getLocations().then(function (locs) {
            $scope.options.locations = locs;
        });
    };

    // --- AI Integration Listener ---
    $scope.$on('AI_FILTER_ALERTS', function (event, data) {
        console.log("AlertsController received AI instructions:", data);

        // Update Filters
        if (data.severity !== undefined) $scope.filters.severity = data.severity;
        if (data.timeRange !== undefined) $scope.filters.timeRange = data.timeRange;
        if (data.search !== undefined) $scope.filters.search = data.search;

        // Ensure status is at least 'All' if they are querying generally, or leave as is.
        // If they specify severity, usually they want to see all of them, not just unread.
        if (data.severity || data.search) {
            $scope.filters.status = 'All';
        }

        // If specific alert data is passed from the AI Backend (e.g. from SQL Execution)
        if (data.alertsData && data.alertsData.length > 0) {
            $timeout(function () {
                $scope.isLoading = true;
                $scope.filteredAlerts = data.alertsData;
                $scope.updatePagination();
                $scope.updateStats();
                $scope.isLoading = false;
            });
        } else {
            // Re-fetch with new filters (Mock Backend Fallback)
            $timeout(function () {
                $scope.fetchAlerts();
            });
        }
    });

    // Also listen to the specific data broadcast if used by chatbot
    $scope.$on('AI_FILTER_ALERTS_DATA', function (event, alertsData) {
        if (alertsData && alertsData.length > 0) {
            $timeout(function () {
                $scope.isLoading = true;
                $scope.filteredAlerts = alertsData;
                $scope.updatePagination();
                $scope.updateStats();
                $scope.isLoading = false;
            });
        }
    });
    $scope.fetchAlerts = function () {
        // Calculate Time Stamps based on Time Range
        var now = Date.now();
        var startTime = 0;
        var endTime = now;

        switch ($scope.filters.timeRange) {
            case '15m': startTime = now - (15 * 60 * 1000); break;
            case '1h': startTime = now - (60 * 60 * 1000); break;
            case '4h': startTime = now - (4 * 60 * 60 * 1000); break;
            case '24h': startTime = now - (24 * 60 * 60 * 1000); break;
            case '7d': startTime = now - (7 * 24 * 60 * 60 * 1000); break;
            case '30d': startTime = now - (30 * 24 * 60 * 60 * 1000); break;
            case 'today':
                var t = new Date(); t.setHours(0, 0, 0, 0); startTime = t.getTime();
                break;
            case 'yesterday':
                var y = new Date(); y.setDate(y.getDate() - 1); y.setHours(0, 0, 0, 0); startTime = y.getTime();
                var yEnd = new Date(); yEnd.setDate(yEnd.getDate() - 1); yEnd.setHours(23, 59, 59, 999); endTime = yEnd.getTime();
                break;
            case 'custom':
                if ($scope.filters.customStart) startTime = new Date($scope.filters.customStart).getTime();
                if ($scope.filters.customEnd) endTime = new Date($scope.filters.customEnd).getTime();
                break;
        }

        var serviceFilters = {
            status: $scope.filters.status,
            severity: $scope.filters.severity,
            location: $scope.filters.location,
            search: $scope.filters.search,
            startTime: startTime,
            endTime: endTime
        };

        $scope.isLoading = true; // Show loading for UX responsiveness
        MockBackendService.getAlerts(serviceFilters).then(function (backendAlerts) {
            // Merge Live Alerts with Backend Alerts
            var all = $scope.liveAlerts.concat(backendAlerts);

            // Simple Client-Side Filtering for Live Alerts
            var result = all.filter(function (a) {
                if ($scope.filters.status && $scope.filters.status !== 'All' && a.status !== $scope.filters.status) return false;
                if ($scope.filters.severity && a.severity !== $scope.filters.severity) return false;
                if ($scope.filters.search) {
                    var s = $scope.filters.search.toLowerCase();
                    if (!a.type.toLowerCase().includes(s) && !a.location.toLowerCase().includes(s) && !a.cameraName.toLowerCase().includes(s)) return false;
                }
                return true;
            });

            $scope.filteredAlerts = result;
            $scope.updatePagination();
            $scope.updateStats();
            $scope.isLoading = false;
        });
    };

    // --- Pagination ---
    $scope.updatePagination = function () {
        $scope.pagination.totalItems = $scope.filteredAlerts.length;
        var start = ($scope.pagination.currentPage - 1) * $scope.pagination.itemsPerPage;
        var end = start + $scope.pagination.itemsPerPage;

        $scope.paginatedAlerts = $scope.filteredAlerts.slice(start, end);

        var showStart = $scope.pagination.totalItems === 0 ? 0 : start + 1;
        var showEnd = Math.min(end, $scope.pagination.totalItems);
        $scope.pagination.label = "Showing " + showStart + "-" + showEnd + " of " + $scope.pagination.totalItems;
    };

    $scope.nextPage = function () {
        if ($scope.pagination.currentPage * $scope.pagination.itemsPerPage < $scope.pagination.totalItems) {
            $scope.pagination.currentPage++;
            $scope.updatePagination();
        }
    };

    $scope.prevPage = function () {
        if ($scope.pagination.currentPage > 1) {
            $scope.pagination.currentPage--;
            $scope.updatePagination();
        }
    };

    // --- Actions ---
    $scope.openAlertDetails = function (alert) {
        // Navigate via parent (MainController)
        $scope.$emit('OPEN_ALERT_DETAILS', alert);
    };

    $scope.acknowledge = function (alert) {
        MockBackendService.acknowledgeAlert(alert.id).then(function () {
            $scope.fetchAlerts();
        });
    };

    $scope.acknowledgeAll = function () {
        if (!confirm("Acknowledge all visible unread alerts?")) return;
        MockBackendService.acknowledgeAll().then(function () {
            $scope.fetchAlerts();
        });
    };

    $scope.resolve = function (alert) {
        MockBackendService.resolveAlert(alert.id).then(function () {
            $scope.fetchAlerts();
        });
    };

    $scope.delete = function (alert) {
        if (!confirm("Delete this alert?")) return;
        MockBackendService.deleteAlert(alert.id).then(function () {
            $scope.fetchAlerts();
        });
    };

    // --- UI Actions ---
    $scope.toggleActionMenu = function ($event, alert) {
        $event.stopPropagation();
        if ($scope.activeActionAlert && $scope.activeActionAlert.id === alert.id && $scope.activeActionMenu) {
            $scope.closeActionMenu();
            return;
        }
        $scope.activeActionAlert = alert;
        $scope.activeActionMenu = true;
        var btn = $event.currentTarget;
        var rect = btn.getBoundingClientRect();
        var top = rect.bottom + window.scrollY + 5;
        var left = rect.right + window.scrollX - 160;
        if (window.innerHeight - rect.bottom < 200) {
            top = rect.top + window.scrollY - 180;
        }
        $scope.menuPosition = {
            top: top + 'px',
            left: left + 'px'
        };
    };

    $scope.closeActionMenu = function () {
        $scope.activeActionMenu = false;
        $scope.activeActionAlert = null;
    };

    $scope.handleAction = function (action, alert) {
        // Logic
    };

    var closeHandler = function () {
        if ($scope.activeActionMenu) {
            $timeout(function () {
                $scope.closeActionMenu();
            });
        }
    };
    document.addEventListener('click', closeHandler);

    $scope.$on('$destroy', function () {
        document.removeEventListener('click', closeHandler);
        if ($scope.refreshInterval) $interval.cancel($scope.refreshInterval);
    });

    // --- Helpers ---
    $scope.updateStats = function () {
        $scope.stats.unread = $scope.filteredAlerts.filter(function (a) { return a.status === 'Unread'; }).length;
        $scope.stats.critical = $scope.filteredAlerts.filter(function (a) { return a.severity === 'Critical'; }).length;
    };

    $scope.getSeverityClass = function (severity) {
        return severity.toLowerCase();
    };

    $scope.formatDate = function (ts) {
        return new Date(ts).toLocaleString();
    };

    $scope.onFilterChange = function () {
        $scope.pagination.currentPage = 1;
        $scope.fetchAlerts();
    };

    $scope.init();
}]);
