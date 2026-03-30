/**
 * Floating Chatbot Controller
 * Handles the logic, expanding/collapsing, and Speech Recognition for the floating AI Bot.
 */
app.controller('ChatbotController', ['$scope', '$timeout', 'KafkaService', function ($scope, $timeout, KafkaService) {
    $scope.isChatbotExpanded = false;
    $scope.isListening = false;
    $scope.chatInput = "";
    $scope.isTyping = false;

    // Initial welcome message
    $scope.chatMessages = [
        { sender: 'ai', text: 'Hi! I am Nura AI. Talk to me or type to search for objects, cameras, or alerts.' }
    ];

    $scope.toggleChatbot = function () {
        $scope.isChatbotExpanded = !$scope.isChatbotExpanded;

        // Auto-focus input when expanded
        if ($scope.isChatbotExpanded) {
            $timeout(function () {
                var input = document.querySelector('.chatbot-wrapper .chat-input');
                if (input) input.focus();
                $scope.scrollToBottom();
            }, 100);
        }
    };

    $scope.scrollToBottom = function () {
        $timeout(function () {
            var body = document.getElementById('floating-chat-body');
            if (body) {
                body.scrollTop = body.scrollHeight;
            }
        });
    };

    // Send Message Logic
    $scope.sendChatMessage = function () {
        if (!$scope.chatInput || !$scope.chatInput.trim()) return;

        var userText = $scope.chatInput.trim();
        $scope.chatMessages.push({ sender: 'user', text: userText });
        $scope.chatInput = "";
        $scope.scrollToBottom();

        // Simulate AI Response State
        $scope.isTyping = true;
        $scope.scrollToBottom();

        // Intent Parsing Logic for Navigation (Demo & Client-Side)
        var lowerText = userText.toLowerCase();
        if (lowerText.includes("alert") || lowerText.includes("alerts")) {
            var severityFilters = ['critical', 'high', 'medium', 'low'];
            var requestedSeverity = '';

            severityFilters.forEach(function (sev) {
                if (lowerText.includes(sev)) {
                    requestedSeverity = sev.charAt(0).toUpperCase() + sev.slice(1);
                }
            });

            var timeFrame = '24h'; // default
            if (lowerText.includes("yesterday")) timeFrame = 'yesterday';
            else if (lowerText.includes("today")) timeFrame = 'today';
            else if (lowerText.includes("week") || lowerText.includes("7 days")) timeFrame = '7d';

            // Extract Search Term based on specific types
            var searchTerms = ['motion', 'intrusion', 'weapon'];
            var requestedSearch = '';
            searchTerms.forEach(function (term) {
                if (lowerText.includes(term)) {
                    requestedSearch = term;
                }
            });

            // Navigate and filter immediately on client side
            if ($scope.$parent && $scope.$parent.navigateTo) {
                $scope.$parent.navigateTo('alerts');
            }

            $scope.$root.$broadcast('AI_FILTER_ALERTS', {
                severity: requestedSeverity,
                timeRange: timeFrame,
                search: requestedSearch
            });

            $timeout(function () {
                $scope.isTyping = false;
                $scope.chatMessages.push({
                    sender: 'ai',
                    text: "I've pulled up the " + (requestedSearch ? requestedSearch + " " : "") + (requestedSeverity ? requestedSeverity.toLowerCase() + " " : "") + "alerts for you on the main screen."
                });
                $scope.scrollToBottom();
            }, 800);
            return; // Skip backend for this specific demo navigational intent
        }

        // --- Send to Backend Kafka ---
        if (typeof KafkaService !== 'undefined' && KafkaService.isConnected()) {
            KafkaService.send({
                type: 'chat_query',
                query: userText
            });
        } else {
            // Fallback if websocket is disconnected
            $timeout(function () {
                $scope.isTyping = false;
                $scope.chatMessages.push({
                    sender: 'ai',
                    text: "I understand you're looking for '" + userText + "'. However, I'm currently offline and cannot reach the backend server."
                });
                $scope.scrollToBottom();
            }, 1000);
        }
    };

    // --- Listen to Backend Kafka Responses ---
    if (typeof KafkaService !== 'undefined') {
        KafkaService.subscribe('ai_response', function (message) {
            console.log("ChatbotController: Received AI Response via Kafka", message);
            $scope.$applyAsync(function () {
                $scope.isTyping = false;

                var responseData = message.response || {};
                var msgText = responseData.text || (typeof message === 'string' ? message : '');

                // Ensure we handle when msgText is blank or an object
                if (!msgText && message.text) msgText = message.text;

                $scope.chatMessages.push({
                    sender: 'ai',
                    text: msgText || "I processed your request, but received an empty response."
                });
                $scope.scrollToBottom();
            });
        });
    }

    $scope.handleChatbotKeyDown = function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            $scope.sendChatMessage();
        }
    };

    // --- Web Speech API (Microphone) Logic ---
    var recognition;

    if ('webkitSpeechRecognition' in window) {
        recognition = new webkitSpeechRecognition();
        recognition.continuous = false; // Stop after they stop talking
        recognition.interimResults = true; // Show results as they speak
        recognition.lang = 'en-US';

        recognition.onstart = function () {
            $scope.$apply(function () {
                $scope.isListening = true;
                $scope.chatInput = "Listening...";
            });
        };

        recognition.onerror = function (event) {
            console.error('Speech recognition error', event.error);
            $scope.$apply(function () {
                $scope.isListening = false;
                if ($scope.chatInput === "Listening...") $scope.chatInput = "";
            });
        };

        recognition.onend = function () {
            $scope.$apply(function () {
                $scope.isListening = false;
            });
        };

        recognition.onresult = function (event) {
            var interim_transcript = '';
            var final_transcript = '';

            for (var i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    final_transcript += event.results[i][0].transcript;
                } else {
                    interim_transcript += event.results[i][0].transcript;
                }
            }

            $scope.$apply(function () {
                $scope.chatInput = final_transcript || interim_transcript;

                // If it's final, auto-send (optional behavior)
                if (final_transcript && !interim_transcript) {
                    // Let them review before sending, or auto-send.
                    // $scope.sendChatMessage(); 
                }
            });
        };
    } else {
        console.warn("Web Speech API is not supported in this browser.");
    }

    $scope.toggleMicrophone = function () {
        if (!recognition) {
            alert("Your browser does not support voice recognition. Please use Google Chrome.");
            return;
        }

        if ($scope.isListening) {
            recognition.stop();
        } else {
            $scope.chatInput = ""; // Clear input before listening
            try {
                recognition.start();
            } catch (e) {
                console.error("Could not start recognition", e);
            }
        }
    };

}]);
