/**
 * NuraAi Controller
 * Handles the chatbot interaction and logic.
 */
app.controller('NuraAiController', ['$scope', '$timeout', 'KafkaService', function ($scope, $timeout, KafkaService) {
    $scope.chatHistory = [
        { sender: 'ai', type: 'text', text: 'Hello! I am NuraAi. I can answer questions about your alerts history.' }
    ];
    $scope.userMessage = '';
    $scope.isTyping = false;
    $scope.suggestions = [
        { label: 'Show Critical Alerts', query: 'Show critical alerts' },
        { label: 'Show All Alerts', query: 'Show all alerts' },
        { label: 'System Status', query: 'Check system status' }
    ];

    // Media Modal State (Image & Video)
    $scope.showMediaModal = false;
    $scope.modalMediaUrl = '';
    $scope.modalMediaType = 'image'; // 'image' or 'video'

    // --- Kafka Subscription ---
    KafkaService.subscribe('ai_response', function (message) {
        console.log("NuraAiController: Received AI Response:", message);
        $timeout(function () {
            $scope.isTyping = false;

            var responseData = message.response || {};
            var msgType = responseData.type || 'text';
            var msgText = responseData.text || (typeof message === 'string' ? message : '');

            var chatMsg = {
                sender: 'ai',
                type: msgType, // 'text' or 'alert-list'
                text: msgText
            };

            if (msgType === 'alert-list' && responseData.data) {
                // Map backend data to UI model if needed
                chatMsg.alerts = responseData.data.map(function (a) {
                    return {
                        id: a.id,
                        type: a.type,
                        severity: a.severity,
                        location: a.location,
                        message: a.message,
                        cameraName: a.cameraName || ("Camera " + a.location), // Use backend name or fallback
                        timestamp: a.timestamp * 1000, // DB has float seconds, JS needs ms
                        description: a.description
                    };
                });
            }

            $scope.chatHistory.push(chatMsg);
            scrollToBottom();
        });
    });

    $scope.openMediaModal = function (url, type) {
        $scope.modalMediaUrl = url;
        $scope.modalMediaType = type || 'image';
        $scope.showMediaModal = true;
    };

    $scope.closeMediaModal = function () {
        $scope.showMediaModal = false;
        $scope.modalMediaUrl = '';
        $scope.modalMediaType = 'image';
    };

    // Scroll to bottom of chat
    function scrollToBottom() {
        $timeout(function () {
            var chatContainer = document.getElementById('nura-ai-chat-body');
            if (chatContainer) {
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }
        }, 50);
    }

    $scope.sendSuggestion = function (chip) {
        $scope.userMessage = chip.query;
        $scope.sendMessage();
    };

    $scope.sendMessage = function () {
        if (!$scope.userMessage.trim()) return;

        // Add User Message
        var userQuery = $scope.userMessage;
        $scope.chatHistory.push({ sender: 'user', type: 'text', text: userQuery });
        $scope.userMessage = '';
        scrollToBottom();

        // Simulate AI Typing
        $scope.isTyping = true;
        scrollToBottom();

        // Process Query via Backend
        processQuery(userQuery);
    };

    $scope.handleKeyDown = function (event) {
        if (event.keyCode === 13 && !event.shiftKey) {
            event.preventDefault();
            $scope.sendMessage();
        }
    };

    function processQuery(query) {
        if (!KafkaService.isConnected()) {
            $scope.chatHistory.push({
                sender: 'ai',
                type: 'text',
                text: "I am currently offline. Please ensure the backend server is running."
            });
            $scope.isTyping = false;
            scrollToBottom();
            return;
        }

        KafkaService.send({
            type: 'chat_query',
            query: query
        });

        // Timeout handling is optional, handled by async response
    }

}]);
