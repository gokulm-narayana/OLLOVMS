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

                // If the backend returned an alert list (from voice or fallback text), navigate to alerts
                if (responseData.type === 'alert-list' && responseData.data && responseData.data.length > 0) {
                    if ($scope.$parent && $scope.$parent.navigateTo) {
                        $scope.$parent.navigateTo('alerts');
                    }

                    // Broadcast the filters so the UI inputs update (e.g. the search box shows "motion")
                    // This matches the behavior of the client-side text intent parser
                    $scope.$root.$broadcast('AI_FILTER_ALERTS', {
                        severity: responseData.severity ? responseData.severity.charAt(0).toUpperCase() + responseData.severity.slice(1) : '',
                        timeRange: '24h', // Default for now
                        search: responseData.search || ''
                    });

                    // Optionally broadcast the specific filtered data if you want the alerts page to only show these
                    $scope.$root.$broadcast('AI_FILTER_ALERTS_DATA', responseData.data);
                }
            });
        });
    }

    $scope.handleChatbotKeyDown = function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            $scope.sendChatMessage();
        }
    };

    // --- MediaRecorder (Native Microphone) Logic ---
    var mediaRecorder = null;
    var audioChunks = [];

    $scope.toggleMicrophone = function ($event) {
        if ($event && $event.preventDefault) {
            $event.preventDefault();
        }

        if ($scope.isListening) {
            // Stop Recording
            if (mediaRecorder && mediaRecorder.state !== "inactive") {
                mediaRecorder.stop();
            }
        } else {
            // Start Recording
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(function (stream) {
                    $scope.$apply(function () {
                        $scope.isListening = true;
                        $scope.chatInput = "Recording Audio...";
                        $scope.isTyping = false;
                    });

                    mediaRecorder = new MediaRecorder(stream);
                    audioChunks = [];

                    mediaRecorder.addEventListener("dataavailable", function (event) {
                        audioChunks.push(event.data);
                    });

                    mediaRecorder.addEventListener("stop", function () {
                        $scope.$apply(function () {
                            $scope.isListening = false;
                            $scope.chatInput = ""; // Clear input
                            $scope.isTyping = true; // Simulating thinking while sending the audio
                        });

                        var audioBlob = new Blob(audioChunks, { type: 'audio/webm' });

                        // Stop tracks to release the mic
                        stream.getTracks().forEach(track => track.stop());

                        // --- Convert WebM/MP4 to WAV using Web Audio API ---
                        var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                        var reader = new FileReader();
                        reader.readAsArrayBuffer(audioBlob);
                        reader.onloadend = function () {
                            audioCtx.decodeAudioData(reader.result, function (buffer) {
                                // Encode AudioBuffer to WAV
                                var wavBlob = audioBufferToWav(buffer);

                                // Convert WAV to Base64 to send over Websocket
                                var base64Reader = new FileReader();
                                base64Reader.readAsDataURL(wavBlob);
                                base64Reader.onloadend = function () {
                                    var base64data = base64Reader.result;

                                    $scope.$applyAsync(function () {
                                        $scope.chatMessages.push({ sender: 'user', text: "🎤 (Voice Message)" });
                                        $scope.scrollToBottom();
                                    });

                                    if (typeof KafkaService !== 'undefined' && KafkaService.isConnected()) {
                                        KafkaService.send({
                                            type: 'chat_audio',
                                            audio: base64data
                                        });
                                    } else {
                                        $timeout(function () {
                                            $scope.isTyping = false;
                                            $scope.chatMessages.push({
                                                sender: 'ai',
                                                text: "I heard your voice, but I am currently offline and cannot reach the thought server."
                                            });
                                            $scope.scrollToBottom();
                                        }, 1000);
                                    }
                                };
                            }, function (e) {
                                console.error("Error decoding audio data", e);
                            });
                        };
                    });

                    mediaRecorder.start();

                })
                .catch(function (err) {
                    console.error("Microphone access denied or not available.", err);
                    alert("Please allow microphone access to use Voice Commands.");
                });
        }
    };

    // Helper: Convert Web Audio API AudioBuffer to WAV Blob
    function audioBufferToWav(buffer, opt) {
        opt = opt || {};
        var numChannels = buffer.numberOfChannels;
        var sampleRate = buffer.sampleRate;
        var format = opt.float32 ? 3 : 1;
        var bitDepth = format === 3 ? 32 : 16;
        var result;
        if (numChannels === 2) {
            result = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
        } else {
            result = buffer.getChannelData(0);
        }
        return encodeWAV(result, format, sampleRate, numChannels, bitDepth);
    }

    function interleave(inputL, inputR) {
        var length = inputL.length + inputR.length;
        var result = new Float32Array(length);
        var index = 0, inputIndex = 0;
        while (index < length) {
            result[index++] = inputL[inputIndex];
            result[index++] = inputR[inputIndex];
            inputIndex++;
        }
        return result;
    }

    function encodeWAV(samples, format, sampleRate, numChannels, bitDepth) {
        var bytesPerSample = bitDepth / 8;
        var blockAlign = numChannels * bytesPerSample;
        var buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
        var view = new DataView(buffer);
        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + samples.length * bytesPerSample, true);
        writeString(view, 8, 'WAVE');
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, format, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * blockAlign, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitDepth, true);
        writeString(view, 36, 'data');
        view.setUint32(40, samples.length * bytesPerSample, true);
        if (format === 1) { // Raw PCM
            floatTo16BitPCM(view, 44, samples);
        } else {
            writeFloat32(view, 44, samples);
        }
        return new Blob([view], { type: 'audio/wav' });
    }

    function floatTo16BitPCM(output, offset, input) {
        for (var i = 0; i < input.length; i++, offset += 2) {
            var s = Math.max(-1, Math.min(1, input[i]));
            output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
    }

    function writeFloat32(output, offset, input) {
        for (var i = 0; i < input.length; i++, offset += 4) {
            output.setFloat32(offset, input[i], true);
        }
    }

    function writeString(view, offset, string) {
        for (var i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

}]);
