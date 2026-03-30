/**
 * Camera Issue Details Controller
 * Manages the specific details page for camera issues (Offline/Warning).
 * SRS Implementation:
 * - Offline: Critical severity, Red theme, Retry/Reboot actions.
 * - Warning: Medium severity, Yellow theme, Live View, Health Bar.
 */
app.controller('CameraIssueDetailsController', ['$scope', '$timeout', function ($scope, $timeout) {
    // State
    $scope.issue = null;
    $scope.loadingAction = false;
    $scope.actionMessage = '';

    // Initialize with data from main controller
    $scope.init = function (issueData) {
        $scope.issue = issueData;
        $scope.actionMessage = '';

        // Enrich data for SRS requirements if missing
        if (!$scope.issue.details) {
            if ($scope.issue.status === 'Offline') {
                $scope.issue.details = {
                    issueType: 'Network Disconnected',
                    detectedTime: $scope.issue.time || '10:45 AM',
                    duration: '2h 15m',
                    possibleCauses: ['Power failure', 'Network disconnection', 'Switch failure']
                };
            } else if ($scope.issue.status === 'Warning') {
                $scope.issue.details = {
                    issueType: 'Low FPS',
                    detectedTime: $scope.issue.time || '11:20 AM',
                    currentFps: 5,
                    expectedFps: 30,
                    impact: 'Motion detection accuracy may be reduced',
                    healthScore: 65
                };
            }
        }
    };

    // Listen for broadcast from MainController (Blank Page Fix)
    $scope.$on('ISSUE_DATA_UPDATED', function (evt, issue) {
        console.log("Issue Details Controller received data:", issue);
        $scope.init(issue);
    });

    $scope.goBack = function () {
        $scope.$parent.activePage = 'dashboard';
    };

    // SRS 4.2.4 & 5.2.5 - Action Logic
    $scope.performAction = function (actionName) {
        $scope.loadingAction = true;

        // Simulate network delay
        $timeout(function () {
            $scope.loadingAction = false;

            switch (actionName) {
                // Offline Actions
                case 'Retry Connection':
                    $scope.actionMessage = "Connection attempt failed. Device unreachable.";
                    break;
                case 'Reboot Camera':
                    $scope.actionMessage = "Reboot command sent to " + $scope.issue.ip;
                    break;
                case 'Check Network':
                    $scope.actionMessage = "Ping test: 100% Packet Loss.";
                    break;

                // Warning Actions
                case 'Refresh Stream':
                    $scope.actionMessage = "Stream refreshed. Buffering...";
                    break;
                case 'Reduce Stream Quality':
                    $scope.actionMessage = "Switched to Sub-stream (Lower Bitrate).";
                    break;



                default:
                    $scope.actionMessage = "Action executed: " + actionName;
            }
        }, 1000);
    };

    // Helper for CSS classes
    $scope.getSeverityClass = function () {
        return $scope.issue && $scope.issue.status === 'Offline' ? 'status-offline' : 'status-warning';
    };
}]);
