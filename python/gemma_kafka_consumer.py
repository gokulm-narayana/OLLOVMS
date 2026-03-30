from kafka import KafkaConsumer
import json
import requests
import time

# --- Configuration ---
KAFKA_TOPIC = 'alerts'
KAFKA_BOOTSTRAP_SERVERS = ['localhost:9092']
OLLAMA_API_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "gemma:2b" # or "gemma:7b" if you have it installed

def generate_ai_insight(alert_data):
    """
    Sends the alert data to the local Gemma model via Ollama.
    """
    prompt = f"""
    You are an advanced security AI for the NuraEye Video Management System.
    Analyze the following security alert and provide a brief, professional assessment.
    
    Alert Details:
    - Type: {alert_data.get('type')}
    - Severity: {alert_data.get('severity')}
    - Location: {alert_data.get('location')}
    - Description: {alert_data.get('description')}
    
    Format your response as:
    1. PRIORITY LEVEL (Low/Medium/High/Critical)
    2. ANALYSIS (1 sentence)
    3. RECOMMENDED ACTION (1 sentence)
    """

    payload = {
        "model": MODEL_NAME,
        "prompt": prompt,
        "stream": False
    }

    try:
        start_time = time.time()
        response = requests.post(OLLAMA_API_URL, json=payload)
        response.raise_for_status()
        end_time = time.time()
        
        result = response.json()
        print(f"--- AI Inference Time: {end_time - start_time:.2f}s ---")
        return result.get('response', 'No response from AI.')
        
    except requests.exceptions.ConnectionError:
        return "Error: Could not connect to Ollama. Is 'ollama serve' running?"
    except Exception as e:
        return f"Error communicating with AI: {e}"

def main():
    print(f"Starting Gemma AI Consumer...")
    print(f"Connecting to Kafka: {KAFKA_BOOTSTRAP_SERVERS}")
    print(f"Target AI Model: {MODEL_NAME}")
    
    # Initialize Consumer
    consumer = KafkaConsumer(
        KAFKA_TOPIC,
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        value_deserializer=lambda x: json.loads(x.decode('utf-8')),
        auto_offset_reset='latest'
    )

    print("Listening for alerts...")

    try:
        for message in consumer:
            alert = message.value
            print("\n" + "="*50)
            print(f"[Kafka] Received Alert: {alert.get('type')} in {alert.get('location')}")
            
            # Send to AI
            print("[Gemma AI] Analyzing...")
            insight = generate_ai_insight(alert)
            
            print("-" * 20)
            print(insight.strip())
            print("="*50 + "\n")

    except KeyboardInterrupt:
        print("Stopping AI Consumer...")
    except Exception as e:
        print(f"Critical Error: {e}")

if __name__ == "__main__":
    main()
