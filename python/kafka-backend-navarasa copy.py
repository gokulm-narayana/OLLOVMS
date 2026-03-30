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
       - English: "Show me alerts", "Camera 5 events"
       - Telugu: "కెమెరా 9 కోసం హెచ్చరికలను చూపించు", "హెచ్చరికలు చూపించు"
       - Tamil: "கேமரா 5 விழிப்பூட்டல்களைக் காட்டு"
       - Hindi: "कैमरा 9 के अलर्ट दिखाएं"
    2. CHAT: The user is saying hello, asking about you, or general conversation.
       - English: "Hi", "Can you speak Telugu?", "Who are you?", "Namaste"
       - Hindi: "तुमको हिंदी आती है", "कैसे हो", "क्या हाल है"
       - Telugu: "మీరు ఎవరు", "మీరు తెలుగు మాట్లాడగలరా"
       - Tamil: "நீங்கள் யார்", "தமிழ் தெரியுமா"
    
    Input: "{user_query}"
    
    Response (ONLY 'QUERY' or 'CHAT'):
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
    Table Schema: alerts(id, type (e.g. 'Intrusion', 'Motion'), severity (e.g. 'Critical', 'High'), location, camera_name, description, timestamp, ai_insight)
    
    RULES:
    1. SELECT * FROM alerts.
    2. Respond with ONLY the SQL query. Do not add explanations.
    3. Use LIKE with % wildcards on BOTH sides for ALL text columns (e.g. LIKE '%value%') to ensure partial matching.
    4. Do NOT use '=' for text columns (type, severity, location, camera_name). ALWAYS use LIKE.
    5. SPECIFICALLY for 'camera_name', use flexible matching. If user says "Camera 5", try to match '%Camera%5%' or just '%5%' if unsure.
    6. Map 'critical', 'high' to severity column only. NEVER map them to type.
    7. If query contains "critical", "high", "medium", "low", use severity column.
    8. For time-based queries, use SQLite's strftime('%s', 'now', ...) to compare against the 'timestamp' column (which is a REAL/FLOAT unix timestamp).
    9. CRITICAL: Do NOT use values from the 'Examples' section below. Use ONLY values from the 'Question' section.
    10. If the 'Question' says "Camera 9", the SQL MUST have `camera_name LIKE '%9%'`. do NOT include Camera 5 or 3 just because they are in examples.
    
    Examples:
    - "Show critical alerts" -> SELECT * FROM alerts WHERE severity LIKE '%Critical%';
    - "Show alerts for Camera 2" -> SELECT * FROM alerts WHERE camera_name LIKE '%Camera%2%';
    - "Show alerts of camera 5" -> SELECT * FROM alerts WHERE camera_name LIKE '%Camera%5%';
    - "Show intrusion alerts" -> SELECT * FROM alerts WHERE type LIKE '%intrusion%';
    - "Show critical alerts for Camera 3" -> SELECT * FROM alerts WHERE severity LIKE '%Critical%' AND camera_name LIKE '%Camera%3%';
    - "Show alerts from the past 1 hour" -> SELECT * FROM alerts WHERE timestamp >= strftime('%s', 'now', '-1 hour');
    - "Show alerts from yesterday" -> SELECT * FROM alerts WHERE timestamp >= strftime('%s', 'now', '-1 day') AND timestamp < strftime('%s', 'now', 'start of day');
    - "Show alerts from 2023-10-27" -> SELECT * FROM alerts WHERE date(timestamp, 'unixepoch') = '2023-10-27';
    - "Show critical alerts in Zone 1" -> SELECT * FROM alerts WHERE severity LIKE '%Critical%' AND location LIKE '%Zone%1%';
    
    # Indian Language Examples (Map to English Columns)
    - "కెమెరా 9 కోసం హెచ్చరికలను చూపించు" -> SELECT * FROM alerts WHERE camera_name LIKE '%Camera%9%';
    - "కేமரா 5 விழிப்பூட்டல்களைக் காட்டு" -> SELECT * FROM alerts WHERE camera_name LIKE '%Camera%5%';
    - "कैमरा 3 के अलर्ट दिखाएं" -> SELECT * FROM alerts WHERE camera_name LIKE '%Camera%3%';
    - "తీవ్రమైన హెచ్చరికలను చూపించు" (Critical Alerts) -> SELECT * FROM alerts WHERE severity LIKE '%Critical%';
    
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
            except Exception as e:
                print(f"Error: {e}")
    finally:
        connected_clients.remove(websocket)
        print("Client Disconnected")

async def main():
    loop = asyncio.get_running_loop()
    asyncio.create_task(kafka_consumer_task(loop))
    async with websockets.serve(handler, "0.0.0.0", WS_PORT):
        print(f"Server running on ws://0.0.0.0:{WS_PORT}")
        await asyncio.Future()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Stopped.")
