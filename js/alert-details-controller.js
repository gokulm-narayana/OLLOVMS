/**
 * Alert Details Controller
 * Handles the logic for the specific Alert Details page.
 */
app.controller('AlertDetailsController', ['$scope', '$timeout', 'MockBackendService', function ($scope, $timeout, MockBackendService) {
    // State
    $scope.alert = null;
    $scope.loadingAction = false;

    // --- Init ---
    $scope.init = function (alertData) {
        $scope.alert = alertData;
    };

    // Listen for broadcast from MainController
    $scope.$on('ALERT_DATA_UPDATED', function (evt, alert) {
        console.log("Alert Details Controller received data:", alert);
        $scope.init(alert);
    });

    $scope.goBack = function () {
        $scope.$parent.activePage = 'alerts';
    };

    // --- Actions ---
    $scope.acknowledge = function () {
        if (!$scope.alert) return;
        $scope.loadingAction = true;

        MockBackendService.acknowledgeAlert($scope.alert.id).then(function () {
            $scope.alert.status = 'Read';
            $scope.loadingAction = false;
        });
    };

    $scope.resolve = function () {
        if (!$scope.alert) return;
        $scope.loadingAction = true;

        MockBackendService.resolveAlert($scope.alert.id).then(function () {
            $scope.alert.status = 'Resolved';
            $scope.loadingAction = false;
        });
    };
    $scope.viewCamera = function () {
        if (!$scope.alert) return;
        // Navigate to Camera Live View
        console.log("Navigating to Live Camera:", $scope.alert.cameraId);
        $scope.$emit('OPEN_CAMERA_LIVE', $scope.alert.cameraId);
    };

    $scope.deleteAlert = function () {
        if (!$scope.alert) return;
        if (!confirm("Are you sure you want to delete this alert?")) return;

        $scope.loadingAction = true;
        MockBackendService.deleteAlert($scope.alert.id).then(function () {
            $scope.loadingAction = false;
            $scope.goBack();
            // Emit event to refresh active alerts list if needed, or rely on parent controller refetch
            $scope.$emit('ALERT_DELETED', $scope.alert.id);
        });
    };

    // --- Helpers ---
    $scope.getSeverityClass = function (severity) {
        if (!severity) return '';
        return 'severity-' + severity.toLowerCase();
    };
}]);
