from kafka import KafkaProducer, errors
import json
import time
import random
import sys

# Configuration
KAFKA_TOPIC = 'alerts'
KAFKA_BOOTSTRAP_SERVERS = ['localhost:9092']

def get_producer():
    retries = 0
    while retries < 10:
        try:
            producer = KafkaProducer(
                bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
                value_serializer=lambda v: json.dumps(v).encode('utf-8')
            )
            print("Successfully connected to Kafka Broker!")
            return producer
        except errors.NoBrokersAvailable:
            print("Waiting for Kafka Broker to be ready... (5s)")
            time.sleep(5)
            retries += 1
    print("Could not connect to Kafka after 10 retries.")
    sys.exit(1)

producer = get_producer()

print(f"Producer started. Sending messages to topic '{KAFKA_TOPIC}'...")

try:
    while True:
        # Simulate Random Camera Alert
        severity = random.choice(['Critical', 'High', 'Medium', 'Low'])
        alert_type = 'Weapon Detected' if severity == 'Critical' else ('Intrusion' if severity == 'High' else 'Motion')
        
        # Consistent ID generation
        timestamp = int(time.time() * 1000)
        
        alert_data = {
            "id": f"kafka-{timestamp}",
            "type": alert_type,
            "cameraName": f"Camera {random.randint(1, 10)}",
            "location": f"Zone {random.randint(1, 5)}",
            "severity": severity,
            "timestamp": timestamp,
            "timeAgo": "Just now",
            "status": "Unread",
            "description": "Real Kafka Alert from Python Producer"
        }
        
        # Send to Kafka
        future = producer.send(KAFKA_TOPIC, alert_data)
        try:
            record_metadata = future.get(timeout=10)
            print(f"Sent: {alert_data['type']} - {alert_data['severity']} (Partition: {record_metadata.partition}, Offset: {record_metadata.offset})")
        except Exception as e:
            print(f"Error executing send: {e}")
        
        # Wait 5 seconds
        time.sleep(5)

except KeyboardInterrupt:
    print("Stopping Producer...")
    producer.close()
