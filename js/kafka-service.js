/**
 * Kafka Service
 * Handles WebSocket connections to a Kafka Gateway/Proxy.
 */
app.factory('KafkaService', ['$q', '$rootScope', function ($q, $rootScope) {
    var Service = {};
    var ws = null;
    var listeners = {}; // Topic -> [Callback]
    var isConnected = false;

    // Configuration
    var WS_URL = 'ws://localhost:8081';

    Service.connect = function () {
        console.log("KafkaService: connect() called. Using URL:", WS_URL);
        var deferred = $q.defer();

        if (ws) {
            deferred.resolve();
            return deferred.promise;
        }

        console.log("KafkaService: Connecting to " + WS_URL + "...");

        try {
            ws = new WebSocket(WS_URL);

            ws.onopen = function () {
                console.log("KafkaService: Connected");
                // VISUAL LOG FOR USER
                alert("Kafka Service: Connected Successfully to ws://localhost:8081!");

                isConnected = true;
                $rootScope.$apply(function () {
                    $rootScope.$broadcast('KAFKA_CONNECTED');
                });
                deferred.resolve();
            };

            ws.onmessage = function (event) {
                try {
                    console.log("KafkaService Raw Message:", event.data); // DEBUG LOG
                    var message = JSON.parse(event.data);

                    // Support 'topic' 
                    var topic = message.topic;

                    if (topic && listeners[topic]) {
                        listeners[topic].forEach(function (callback) {
                            // Controllers must handle scope updates safely (e.g. via $timeout).
                            // We removed $apply here to avoid digest conflicts.
                            callback(message.payload || message);
                        });
                    }
                } catch (e) {
                    console.error("KafkaService: Error parsing message", e);
                }
            };

            ws.onerror = function (err) {
                console.error("KafkaService: Socket Error - Check if 'python3 kafka-backend.py' is running and port 8081 is open.", err);
                deferred.reject(err);
            };

            ws.onclose = function () {
                console.log("KafkaService: Connection Closed");
                isConnected = false;
                ws = null;
                $rootScope.$apply(function () {
                    $rootScope.$broadcast('KAFKA_DISCONNECTED');
                });
            };

        } catch (e) {
            console.error("KafkaService: Connection Failed", e);
            deferred.reject(e);
        }

        return deferred.promise;
    };

    Service.subscribe = function (topic, callback) {
        if (!listeners[topic]) {
            listeners[topic] = [];
        }
        listeners[topic].push(callback);
        console.log("KafkaService: Subscribed to topic '" + topic + "'");
    };

    Service.send = function (data) {
        if (ws && isConnected) {
            ws.send(JSON.stringify(data));
        } else {
            console.error("KafkaService: Cannot send message, WebSocket not connected.");
        }
    };

    Service.isConnected = function () {
        return isConnected;
    };

    return Service;
}]);
