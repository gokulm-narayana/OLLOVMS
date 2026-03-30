app.controller('SettingsController', ['$scope', '$timeout', function ($scope, $timeout) {

    // --- Navigation ---
    $scope.activeTab = 'general';
    $scope.setTab = function (tab) {
        $scope.activeTab = tab;
    };

    // --- General Settings ---
    $scope.general = {
        systemName: 'NuraEye VMS Enterprise',
        language: localStorage.getItem("preferred_language") || 'en',
        timezone: 'UTC-05:00',
        autoLogout: 30, // minutes
        theme: 'dark' // Synced with main controller ideally, but local for form
    };

    $scope.languages = [
        { code: 'en', name: 'English (US)' },
        { code: 'hi', name: 'हिन्दी (Hindi)' },
        { code: 'te', name: 'తెలుగు (Telugu)' }
    ];

    $scope.changeLanguage = function () {
        if ($scope.$parent.changeLanguage) {
            $scope.$parent.changeLanguage($scope.general.language);
        }
    };

    $scope.timezones = [
        'UTC-08:00 (Pacific Time)',
        'UTC-05:00 (Eastern Time)',
        'UTC+00:00 (GMT)',
        'UTC+01:00 (Central European Time)',
        'UTC+05:30 (India Standard Time)',
        'UTC+09:00 (Japan Standard Time)'
    ];

    // --- Users & Roles ---
    $scope.users = [
        { id: 1, name: 'John Doe', email: 'admin@nuraeye.com', role: 'Administrator', status: 'Active', initials: 'JD' },
        { id: 2, name: 'Jane Smith', email: 'jane.smith@nuraeye.com', role: 'Operator', status: 'Active', initials: 'JS' },
        { id: 3, name: 'Security Desk', email: 'desk@nuraeye.com', role: 'Viewer', status: 'Active', initials: 'SD' }
    ];

    $scope.roles = ['Administrator', 'Operator', 'Viewer'];

    $scope.addUser = function () {
        // Placeholder for modal
        alert("Add User functionality would open a modal here.");
    };

    $scope.editUser = function (user) {
        alert("Edit user: " + user.name);
    };

    $scope.deleteUser = function (user) {
        if (confirm("Are you sure you want to delete " + user.name + "?")) {
            $scope.users = $scope.users.filter(u => u.id !== user.id);
        }
    };

    // --- Storage ---
    $scope.storage = {
        totalSpace: 8000, // GB
        usedSpace: 5420, // GB
        retentionDays: 45,
        minRetention: 30,
        enableOverwrite: true,
        backupSchedule: 'Daily'
    };

    // Calculated percentage
    $scope.getStoragePercentage = function () {
        return ($scope.storage.usedSpace / $scope.storage.totalSpace) * 100;
    };

    // --- Network ---
    $scope.network = {
        ipType: 'Static',
        ipAddress: '192.168.1.100',
        subnetMask: '255.255.255.0',
        gateway: '192.168.1.1',
        dns1: '8.8.8.8',
        dns2: '8.8.4.4',
        httpPort: 80,
        httpsPort: 443,
        rtspPort: 554
    };

    // --- System ---
    $scope.system = {
        version: 'v2.4.1 (Build 20240215)',
        serialNumber: 'NE-VMS-8882-991A',
        licenseStatus: 'Valid (Enterprise)',
        lastBackup: '2024-02-06 03:00 AM',
        uptime: '15d 4h 23m'
    };

    $scope.checkUpdates = function () {
        $scope.isChecking = true;
        $timeout(function () {
            $scope.isChecking = false;
            alert("System is up to date.");
        }, 2000);
    };

    $scope.restartSystem = function () {
        if (confirm("Are you sure you want to restart the VMS services? This will interrupt recording for a few moments.")) {
            alert("Restarting services...");
        }
    };

    // --- Save Actions ---
    $scope.saveSettings = function () {
        // Simulate API saving
        var btn = document.activeElement;
        var originalText = btn.innerText;
        btn.innerText = "Check icon here... Saved!";
        btn.disabled = true;

        $timeout(function () {
            btn.innerText = originalText;
            btn.disabled = false;
        }, 1500);
    };

}]);
