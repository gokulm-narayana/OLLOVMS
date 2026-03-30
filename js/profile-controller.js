/**
 * Profile Controller
 * Handles user profile management, security settings, and activity logs.
 */
app.controller('ProfileController', ['$scope', '$timeout', function ($scope, $timeout) {

    // --- User Data ---
    $scope.profile = {
        name: 'John Doe',
        email: 'admin@nuraeye.com',
        role: 'Administrator',
        phone: '+1 (555) 019-2834',
        department: 'Security Operations',
        initials: 'JD',
        avatarUrl: null, // Could be a URL
        joinedDate: 'March 15, 2023'
    };

    // --- Security Settings ---
    $scope.security = {
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
        twoFactorEnabled: true,
        sessionTimeout: 30 // minutes
    };

    // --- Preferences ---
    $scope.preferences = {
        theme: $scope.$parent && $scope.$parent.theme ? $scope.$parent.theme : 'light', // Sync with global
        notifications: {
            email: true,
            push: true,
            sms: false,
            criticalAlerts: true,
            systemHealth: true
        },
        defaultView: 'dashboard'
    };

    // --- Activity Log ---
    $scope.activityLog = [
        { action: 'Login Successful', ip: '192.168.1.5', time: 'Just now', device: 'Chrome / Mac OS' },
        { action: 'Updated Camera Settings (Cam-02)', ip: '192.168.1.5', time: '2 hours ago', device: 'Chrome / Mac OS' },
        { action: 'Exported Video Clip', ip: '192.168.1.5', time: 'Yesterday, 4:30 PM', device: 'Chrome / Mac OS' },
        { action: 'Password Changed', ip: '10.0.0.12', time: '3 days ago', device: 'Mobile App / iOS' },
        { action: 'Failed Login Attempt', ip: '45.33.22.11', time: '5 days ago', device: 'Unknown' }
    ];

    // --- Actions ---

    $scope.triggerAvatarUpload = function () {
        document.getElementById('avatar-upload').click();
    };

    $scope.handleAvatarSelect = function (element) {
        var file = element.files[0];
        if (file) {
            var reader = new FileReader();
            reader.onload = function (e) {
                $timeout(function () {
                    $scope.profile.avatarUrl = e.target.result;
                });
            };
            reader.readAsDataURL(file);
        }
    };

    $scope.saveProfile = function () {
        // Update initials based on name
        if ($scope.profile.name) {
            var parts = $scope.profile.name.trim().split(/\s+/);
            if (parts.length >= 2) {
                $scope.profile.initials = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
            } else if (parts.length === 1 && parts[0].length > 0) {
                $scope.profile.initials = parts[0].substring(0, 2).toUpperCase();
            }
        }

        // Simulate API call
        var btn = document.getElementById('save-profile-btn');
        var originalText = btn ? btn.innerText : 'Save Changes';
        if (btn) btn.innerText = 'Saving...';

        $timeout(function () {
            if (btn) btn.innerText = 'Saved!';
            $timeout(function () {
                if (btn) btn.innerText = originalText;
            }, 2000);
        }, 800);
    };

    $scope.changePassword = function () {
        if ($scope.security.newPassword !== $scope.security.confirmPassword) {
            alert("New passwords do not match.");
            return;
        }
        if (!$scope.security.currentPassword) {
            alert("Please enter your current password.");
            return;
        }

        // Simulate API
        alert("Password successfully updated. Please login again with your new credentials.");
        $scope.security.currentPassword = '';
        $scope.security.newPassword = '';
        $scope.security.confirmPassword = '';
    };

    $scope.toggle2FA = function () {
        $scope.security.twoFactorEnabled = !$scope.security.twoFactorEnabled;
        var status = $scope.security.twoFactorEnabled ? "enabled" : "disabled";
        // In real app, might require a modal to scan QR code if enabling
        console.log("2FA is now " + status);
    };

    $scope.logoutAllSessions = function () {
        if (confirm("Are you sure you want to log out of all other devices?")) {
            alert("All other sessions have been terminated.");
        }
    };

}]);
