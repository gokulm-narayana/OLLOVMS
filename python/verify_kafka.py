from kafka import KafkaProducer, KafkaConsumer
import json
import time

KAFKA_TOPIC = 'test-verification'
BOOTSTRAP_SERVERS = ['localhost:9092']

print("1. Attempting to connect to Kafka Broker...")
try:
    producer = KafkaProducer(
        bootstrap_servers=BOOTSTRAP_SERVERS,
        value_serializer=lambda v: json.dumps(v).encode('utf-8')
    )
    print("   SUCCESS! Connected to Broker.")
    
    print("2. Sending Test Message...")
    producer.send(KAFKA_TOPIC, {'status': 'working'})
    producer.flush()
    print("   SUCCESS! Message Sent.")
    
    print("3. Attempting to Consume Message...")
    consumer = KafkaConsumer(
        KAFKA_TOPIC,
        bootstrap_servers=BOOTSTRAP_SERVERS,
        auto_offset_reset='earliest',
        enable_auto_commit=True,
        group_id='test-group-1',
        value_deserializer=lambda x: json.loads(x.decode('utf-8')),
        consumer_timeout_ms=5000
    )
    
    msg_found = False
    for message in consumer:
        if message.value.get('status') == 'working':
            print("   SUCCESS! Message Received: " + str(message.value))
            msg_found = True
            break
            
    if not msg_found:
        print("   FAILURE: Did not receive message (Timeout).")
    else:
        print("\nVERIFICATION COMPLETE: Kafka is working perfectly.")

except Exception as e:
    print(f"\nFAILURE: Critical Error - {e}")
