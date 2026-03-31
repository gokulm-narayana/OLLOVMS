import asyncio
import json
import websockets
import requests
import time
import sqlite3
import os
from aiokafka import AIOKafkaConsumer

# Configuration
KAFKA_TOPIC = 'alerts'
KAFKA_BOOTSTRAP_SERVERS = 'localhost:9092'
WS_PORT = 8081
OLLAMA_API_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "gemma-navarasa"
DB_FILE = ".alerts.db"

# --- Shuka v1 Global ML Initialization ---
import torch
import librosa
import numpy as np
import base64
import io
import soundfile as sf
from transformers import AutoModel, AutoProcessor

SHUKA_MODEL_ID = "sarvamai/shuka-1"
# Device configuration: use Apple Silicon GPU if available
DEVICE = "mps" if torch.backends.mps.is_available() else "cpu"
shuka_processor = None
shuka_model = None

def init_shuka():
    global shuka_processor, shuka_model
    print(f"Loading Shuka v1 into {DEVICE} memory. This will take a moment...")
    try:
        shuka_processor = AutoProcessor.from_pretrained(SHUKA_MODEL_ID, trust_remote_code=True)
        shuka_model = AutoModel.from_pretrained(SHUKA_MODEL_ID, trust_remote_code=True, torch_dtype=torch.float16)
        shuka_model = shuka_model.to(DEVICE)
        print("Shuka v1 initialized and loaded directly onto the GPU.")
    except Exception as e:
        print(f"CRITICAL: Failed to load Shuka v1 Model: {e}")


# --- Database Functions ---   
def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS alerts
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  type TEXT,
                  severity TEXT,
                  location TEXT,
                  camera_name TEXT,
                  description TEXT,
                  timestamp REAL,
                  ai_insight TEXT)''')
    conn.commit()
    conn.close()
    print(f"Database initialized: {DB_FILE}")

def save_alert_to_db(alert_data, ai_insight):
    try:
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        c.execute("INSERT INTO alerts (type, severity, location, camera_name, description, timestamp, ai_insight) VALUES (?, ?, ?, ?, ?, ?, ?)",
                  (alert_data.get('type'), alert_data.get('severity'), alert_data.get('location'), 
                   alert_data.get('cameraName'), alert_data.get('description'), time.time(), ai_insight))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"DB Error: {e}")

def execute_read_query(sql_query):
    try:
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        c.execute(sql_query)
        results = c.fetchall()
        conn.close()
        return results
    except Exception as e:
        return f"Error executing SQL: {e}"

# --- AI Functions ---
def query_ollama(prompt):
    payload = {
        "model": MODEL_NAME,
        "prompt": prompt,
        "stream": False
    }
    try:
        response = requests.post(OLLAMA_API_URL, json=payload, timeout=30)
        response.raise_for_status()
        return response.json().get('response', '')
    except Exception as e:
        print(f"Ollama Error: {e}")
        return f"Error: {e}"

def generate_ai_insight(alert_data):
    prompt = f"""
    You are an advanced security AI. Analyze this alert:
    - Type: {alert_data.get('type')}
    - Severity: {alert_data.get('severity')}
    - Location: {alert_data.get('location')}
    - Description: {alert_data.get('description')}
    
    Response Format:
    1. PRIORITY: (Level)
    2. ACTION: (1 sentence)
    """
    return query_ollama(prompt)

def process_user_query(user_query):
    # Step 0: Smart Router (Intent Classification)
    router_prompt = f"""
    Classify this user input into one of two categories:
    1. QUERY: The user is asking to see alerts, data, camera footage, or specific events.
       - English: "Show me alerts", "Camera 5 events", "Fetch the last 5 alerts", "Get me data", "Pull up records", "motion", "intrusion", "weapon"
       - Telugu: "కెమెరా 9 కోసం హెచ్చరికలను చూపించు", "హెచ్చరికలు చూపించు", "Alerts chupinchu", "Data tiskura"
       - Tamil: "కేమరా 5 విழிப்பூட்டல்களைக் காட்டு", "Data kondu va", "Alerts kattu"
       - Hindi: "कैమరా 9 के अलर्ट दिखाएं", "Alerts dikhao", "Data nikalo"
    2. CHAT: The user is saying hello, asking about you, or general conversation.
       - Telugu: "మీరు ఎవరు", "మీరు తెలుగు మాట్లాడగలరా" (Can you speak Telugu?)
       - Tamil: "நீங்கள் யார்", "தமிழ் தெரியுமா"
       - Hindi: "तुमको हिंदी आती है", "कैसे हो", "क्या हाल है"
       - English: "Hi", "Can you speak Telugu?", "Who are you?", "Namaste"
    
    Input: "{user_query}"
    
    Category (QUERY or CHAT):
    """
    intent = query_ollama(router_prompt).strip().upper()
    print(f"DEBUG: Intent Classified as: {intent}")

    if "CHAT" in intent:
        # Handle as General Chat
        chat_prompt = f"""
        You are Gemma Navarasa, a helpful security assistant. 
        The user said: "{user_query}"
        Reply naturally in the same language as the user. If they ask about your capabilities, mention you can track alerts and cameras.
        """
        response_text = query_ollama(chat_prompt)
        return {
            "text": response_text,
            "type": "text",
            "data": []
        }

    # Step 1: NL to SQL (Existing Logic for QUERY)
    sql_prompt = f"""
    You are a SQL expert. Convert this question into a SQLite query for the 'alerts' table.
    Table Schema: alerts(id, type, severity, location, camera_name, description, timestamp, ai_insight)
    
    RULES:
    1. SELECT * FROM alerts.
    2. Respond with ONLY the SQL query. Do not add explanations.
    3. Use LIKE for text columns (e.g. LIKE '%value%').
    4. CRITICAL: For Camera Numbers, use a SPACE before the number if possible.
       - "Camera 5" -> camera_name LIKE '%Camera 5%' (Space prevents matching 'Camera15')
       - usage: LIKE '%Camera 5%' OR LIKE '%Camera 5'
    5. Do NOT use values from the 'Examples' below. Use ONLY values from the 'Question'.
    
    Examples:
    - "Show alerts for Camera 5" -> SELECT * FROM alerts WHERE camera_name LIKE '%Camera 5%';
    - "Fetch the last 5 alerts" -> SELECT * FROM alerts ORDER BY timestamp DESC LIMIT 5;
    - "Pull up records for Camera 2" -> SELECT * FROM alerts WHERE camera_name LIKE '%Camera 2%';
    - "Show me motion alerts" -> SELECT * FROM alerts WHERE type LIKE '%Motion%';
    - "I need intrusion alerts" -> SELECT * FROM alerts WHERE type LIKE '%Intrusion%';
    - "Any weapon detected?" -> SELECT * FROM alerts WHERE type LIKE '%Weapon%';
    - "Alerts dikhao" (Hindi) -> SELECT * FROM alerts;
    - "Data tiskura" (Telugu) -> SELECT * FROM alerts;
    - "Alerts kattu" (Tamil) -> SELECT * FROM alerts;
    
    # Indian Language Examples (Map to English Columns)
    - "కెమెరా 9 కోసం హెచ్చరికలను చూపించు" -> SELECT * FROM alerts WHERE camera_name LIKE '%Camera 9%';
    - "కేమరా 5 విழிப்பூటல்களைக் காட்டு" -> SELECT * FROM alerts WHERE camera_name LIKE '%Camera 5%';
    - "కైమరా 3 కే అలర్ట్ దిఖాయే" -> SELECT * FROM alerts WHERE camera_name LIKE '%Camera 3%';
    - "తీవ్రమైన హెచ్చరికలను చూపించు" (Critical Alerts) -> SELECT * FROM alerts WHERE severity LIKE '%Critical%';
    - "मोशन अलर्ट दिखाओ" (Show motion alerts) -> SELECT * FROM alerts WHERE type LIKE '%Motion%';
    
    Question: "{user_query}"
    
    SQL:
    """
    ai_response = query_ollama(sql_prompt).strip()
    
    # Cleaning: Remove markdown, "Sure", "Here is", etc.
    generated_sql = ai_response.replace('```sql', '').replace('```', '').strip()
    if "SELECT" in generated_sql.upper():
        # Extract strictly from SELECT to semicolon (or end)
        import re
        match = re.search(r'(SELECT.*?(?:;|$))', generated_sql, re.IGNORECASE | re.DOTALL)
        if match:
            generated_sql = match.group(1).strip()
    
    print(f"DEBUG: Generated SQL: {generated_sql}")
    # Force print to stdout for debugging
    import sys
    sys.stdout.flush()
    results = execute_read_query(generated_sql)
    print(f"DEBUG: SQL Results: {results}")
    
    formatted_data = []
    if isinstance(results, list):
        for row in results:
            if len(row) >= 7:
                 formatted_data.append({
                    "id": row[0],
                    "type": row[1],
                    "severity": row[2],
                    "location": row[3],
                    "cameraName": row[4],
                    "description": row[5],
                    "timestamp": row[6],
                    "ai_insight": row[7] if len(row) > 7 else ""
                })

    # Step 3: Summarize via AI
    if not formatted_data:
        # If SQL was invalid or no results, try to be helpful
        if isinstance(results, str) and "Error" in results:
            final_response_text = f"I'm having trouble understanding. (Debug: {results})"
        else:
            final_response_text = "No alerts found matching your criteria."
    else:
        # Provide better context for the summary, allowing more results
        # summary_prompt = f"Summarize these alerts concisely in one sentence. Do not mention internal IDs. Alerts: {json.dumps(formatted_data[:50])}"
        final_response_text = f"Found {len(formatted_data)} alerts matching your criteria."

    return {
        "text": final_response_text,
        "type": "alert-list" if formatted_data else "text",
        "data": formatted_data
    }

async def process_shuka_audio(base64_audio):
    """
    Takes Base64 encoded WebM/Wav audio from the browser,
    runs it through the local Shuka v1 PyTorch model,
    executes the resulting SQL, and returns the formatted alerts.
    """
    if not shuka_model or not shuka_processor:
        return {
            "text": "The audio model (Shuka v1) is not currently loaded in memory.",
            "type": "text",
            "data": []
        }

    try:
        # Decode Base64 to binary
        import re
        base64_audio = re.sub('^data:audio/.*?base64,', '', base64_audio)
        audio_data = base64.b64decode(base64_audio)
        
        # Load audio using soundfile
        audio_file = io.BytesIO(audio_data)
        audio, sr = sf.read(audio_file)

        # Resample to 16000Hz as required by Shuka/Whisper
        if sr != 16000:
            audio = librosa.resample(audio, orig_sr=sr, target_sr=16000)

        # Convert to mono if it's stereo
        if len(audio.shape) > 1:
            audio = librosa.to_mono(audio.T)
            
        print("DEBUG: Processing audio with Shuka v1...")

        # Shuka Prompt (Following specific Hugging Face instruction format)
        prompt = [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": [
                {"type": "audio"},
                {"type": "text", "text": "Listen to the user's voice command and output ONLY a SQLite query for the 'alerts' table. Schema: alerts(id, type, severity, location, camera_name, description, timestamp). Use LIKE. Return ONLY the SQL query without any explanations or formatting."}
            ]}
        ]

        # Prepare inputs
        inputs = shuka_processor(
            text=shuka_processor.apply_chat_template(prompt, tokenize=False, add_generation_prompt=True),
            audios=audio,
            sampling_rate=16000,
            return_tensors="pt"
        ).to(DEVICE, torch.float16)

        # Generate SQL
        with torch.no_grad():
            outputs = shuka_model.generate(**inputs, max_new_tokens=100)
            
        # Decode and clean response
        generated_sql = shuka_processor.decode(outputs[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True).strip()
        print(f"DEBUG: Shuka v1 Generated SQL: {generated_sql}")
        
        # Clean up any residual markdown if it hallucinates it
        generated_sql = generated_sql.replace('```sql', '').replace('```', '').strip()
        if "SELECT" in generated_sql.upper():
            match = re.search(r'(SELECT.*?(?:;|$))', generated_sql, re.IGNORECASE | re.DOTALL)
            if match:
                generated_sql = match.group(1).strip()
                
        # Execute Query (fallback to empty list if Shuka hallucinated nonsense instead of SQL)
        if "SELECT" not in generated_sql.upper():
            print("DEBUG: Shuka failed to generate valid SQL. Halting read.")
            return {
                "text": "Sorry, I couldn't understand the voice command properly.",
                "type": "text",
                "data": []
            }

        results = execute_read_query(generated_sql)
        
        formatted_data = []
        if isinstance(results, list):
            for row in results:
                if len(row) >= 7:
                    formatted_data.append({
                        "id": row[0],
                        "type": row[1],
                        "severity": row[2],
                        "location": row[3],
                        "cameraName": row[4],
                        "description": row[5],
                        "timestamp": row[6],
                        "ai_insight": row[7] if len(row) > 7 else ""
                    })

        final_response_text = f"Found {len(formatted_data)} alerts from your voice command." if formatted_data else "No alerts matched your voice command."
        
        return {
            "text": final_response_text,
            "type": "alert-list" if formatted_data else "text",
            "data": formatted_data
        }

    except Exception as e:
        print(f"Error processing audio: {e}")
        return {
            "text": f"Error translating audio: {e}",
            "type": "text",
            "data": []
        }

# --- WebSocket Handlers ---
connected_clients = set()

async def kafka_consumer_task(loop):
    init_db()
    consumer = AIOKafkaConsumer(
        KAFKA_TOPIC,
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        value_deserializer=lambda x: json.loads(x.decode('utf-8')),
        auto_offset_reset='latest'
    )
    await consumer.start()
    print("Kafka Consumer Started.")
    try:
        async for message in consumer:
            kafka_data = message.value
            ai_insight = await loop.run_in_executor(None, generate_ai_insight, kafka_data)
            await loop.run_in_executor(None, save_alert_to_db, kafka_data, ai_insight)
            payload = json.dumps({
                "topic": KAFKA_TOPIC,
                "payload": kafka_data,
                "ai_insight": ai_insight
            })
            if connected_clients:
                await asyncio.gather(*[client.send(payload) for client in connected_clients])
    finally:
        await consumer.stop()

async def handler(websocket):
    print("Client Connected")
    connected_clients.add(websocket)
    loop = asyncio.get_running_loop()
    
    # Send existing alerts on connection
    try:
        initial_alerts = await loop.run_in_executor(None, execute_read_query, "SELECT * FROM alerts ORDER BY timestamp DESC LIMIT 50")
        if initial_alerts and isinstance(initial_alerts, list):
            formatted_alerts = []
            for row in initial_alerts:
                if len(row) >= 7:
                    formatted_alerts.append({
                        "id": row[0],
                        "type": row[1],
                        "severity": row[2],
                        "location": row[3],
                        "cameraName": row[4],
                        "description": row[5],
                        "timestamp": row[6],
                        "ai_insight": row[7] if len(row) > 7 else ""
                    })
            await websocket.send(json.dumps({
                "topic": "initial_alerts",
                "payload": formatted_alerts
            }))
    except Exception as e:
        print(f"Error sending initial alerts: {e}")
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                if data.get('type') == 'chat_query':
                    user_query = data.get('query')
                    response_data = await loop.run_in_executor(None, process_user_query, user_query)
                    await websocket.send(json.dumps({
                        "topic": "ai_response",
                        "response": response_data
                    }))
                elif data.get('type') == 'chat_audio':
                    base64_audio = data.get('audio')
                    # Run the neural network in the ThreadPool to avoid blocking the WebSocket ping loop
                    response_data = await process_shuka_audio(base64_audio)
                    await websocket.send(json.dumps({
                        "topic": "ai_response",
                        "response": response_data
                    }))
            except Exception as e:
                print(f"Error: {e}")
    finally:
        connected_clients.remove(websocket)
        print("Client Disconnected")

async def main():
    loop = asyncio.get_running_loop()
    
    # Run the heavy Shuka startup sequence synchronously before starting the event loop
    init_shuka()
    
    asyncio.create_task(kafka_consumer_task(loop))
    async with websockets.serve(handler, "0.0.0.0", WS_PORT):
        print(f"Server running on ws://0.0.0.0:{WS_PORT}")
        await asyncio.Future()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Stopped.")
