from kafka import KafkaAdminClient
from kafka.admin import ConfigResource, ConfigResourceType

# Configuration
BOOTSTRAP_SERVERS = ['localhost:9092']
TOPIC_NAME = 'alerts'

# Retention Limits
RETENTION_DAYS = 10
RETENTION_GB = 50

# Calculate milliseconds and bytes
retention_ms = RETENTION_DAYS * 24 * 60 * 60 * 1000
retention_bytes = RETENTION_GB * 1024 * 1024 * 1024

print(f"Configuring retention for topic '{TOPIC_NAME}'...")
print(f" - Time Limit: {RETENTION_DAYS} days ({retention_ms} ms)")
print(f" - Size Limit: {RETENTION_GB} GB ({retention_bytes} bytes)")

try:
    admin_client = KafkaAdminClient(bootstrap_servers=BOOTSTRAP_SERVERS)

    topic_config = ConfigResource(
        resource_type=ConfigResourceType.TOPIC,
        name=TOPIC_NAME,
        configs={
            'retention.ms': str(retention_ms),
            'retention.bytes': str(retention_bytes)
        }
    )

    admin_client.alter_configs([topic_config])
    print("SUCCESS: Retention policy updated.")

except Exception as e:
    print(f"ERROR: Failed to update retention policy: {e}")
