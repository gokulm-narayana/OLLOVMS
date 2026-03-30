/**
 * Dashboard Controller
 */
app.controller('DashboardController', ['$scope', 'MockBackendService', 'KafkaService', function ($scope, MockBackendService, KafkaService) {
    $scope.isLoading = true;
    $scope.error = null;
    $scope.data = {};

    // Config Modal State
    $scope.settingsModalOpen = false;
    $scope.activeZoneId = null;
    $scope.activeZoneTitle = '';

    // Widget Configuration
    $scope.widgetConfig = {
        zone1: { total: true, online: true, offline: true, recording: true },
        zone2: { storage: true, cpu: true, memory: true, server: true },
        zone3: { issues: true },
        zone4: { alerts: true }
    };

    // Temporary config for the modal (so we can cancel changes)
    $scope.tempConfig = {};
    $scope.tempConfigKeys = []; // Array to iterate in ng-repeat

    $scope.init = function () {
        $scope.loadData();
    };

    $scope.loadData = function () {
        $scope.isLoading = true;
        $scope.error = null;

        // --- Kafka Subscription ---
        KafkaService.subscribe('alerts', function (alertPayload) {
            console.log("DashboardController: Real-time Alert:", alertPayload);

            if (!$scope.data.alerts) $scope.data.alerts = [];
            $scope.data.alerts.unshift(alertPayload);
            // Keep only last 5 for dashboard
            if ($scope.data.alerts.length > 5) $scope.data.alerts.pop();
        });

        MockBackendService.getDashboardData().then(function (data) {
            $scope.data = data;
            // If we have real alerts from history, ensure they persist over mock's empty array
            // (The subscription above manages data.alerts, so we should be careful not to overwrite it with mock empty array if mock returns later)
            // But MockBackendService.getDashboardData returns a structured object. 
            // We should let the Kafka subscriptions handle the alerts array specifically.
            $scope.isLoading = false;
        }, function (err) {
            console.error("Dashboard Error:", err);
            $scope.error = "Unable to load data";
            $scope.isLoading = false;
        });
    };

    $scope.getSeverityColor = function (severity) {
        if (severity === 'Critical') return 'var(--danger-color)';
        if (severity === 'Warning') return 'var(--warning-color)';
        return 'var(--accent-color)';
    };

    // Settings Modal Logic
    $scope.openSettings = function (zoneId, title) {
        $scope.activeZoneId = zoneId;
        $scope.activeZoneTitle = title; // 'Camera Summary', etc.

        // Clone config for editing
        var configKey = zoneId.replace('-', '');
        if (!$scope.widgetConfig[configKey]) return; // Safety check

        $scope.tempConfig = angular.copy($scope.widgetConfig[configKey]);

        // Prepare keys for ng-repeat
        $scope.tempConfigKeys = Object.keys($scope.tempConfig).map(function (key) {
            return {
                key: key,
                label: key.charAt(0).toUpperCase() + key.slice(1)
            };
        });

        $scope.settingsModalOpen = true;
    };

    $scope.closeSettings = function () {
        $scope.settingsModalOpen = false;
        $scope.activeZoneId = null;
    };

    $scope.saveSettings = function () {
        if ($scope.activeZoneId) {
            var configKey = $scope.activeZoneId.replace('-', '');
            $scope.widgetConfig[configKey] = angular.copy($scope.tempConfig);
        }
        $scope.closeSettings();
    };

    $scope.resolveIssue = function (issue) {
        console.log("Dashboard: Opening details for", issue.name);
        // Requirement 2.1: Navigation Flow -> Camera Issue Details Page
        $scope.$emit('OPEN_ISSUE_DETAILS', issue);
    };

    $scope.openAlertDetails = function (alert) {
        console.log("Dashboard: Opening alert details for", alert.type);
        $scope.$emit('OPEN_ALERT_DETAILS', alert);
    };

    // Init
    $scope.init();
}]);
