import asyncio
import websockets
import json

# Configuration
URI = "ws://localhost:8081"

# Test Queries in Different Languages
TEST_QUERIES = [
    {"lang": "English", "query": "Show alerts for Camera 5"},
    {"lang": "Telugu", "query": "కెమెరా 5 కోసం హెచ్చరికలను చూపించు"},  # Show alerts for Camera 5
    {"lang": "Tamil", "query": "கேமரா 5 க்கான விழிப்பூட்டல்களைக் காட்டு"}, # Show alerts for Camera 5
    {"lang": "Hindi", "query": "कैमरा 5 के लिए अलर्ट दिखाएं"},          # Show alerts for Camera 5
    {"lang": "English (Chat)", "query": "Can you speak Telugu?"},
    {"lang": "Telugu (Chat)", "query": "మీరు తెలుగు మాట్లాడగలరా?"}
]

async def test_language():
    try:
        async with websockets.connect(URI) as websocket:
            print(f"Connected to {URI}\n")
            
            # Ignite the initial alerts dump (ignore it)
            # Depending on timing, initial alerts might come immediately or after a slight delay.
            # We'll just listen for the response to our queries.
            
            for test in TEST_QUERIES:
                print(f"--- Testing {test['lang']} ---")
                print(f"Input: {test['query']}")
                
                # Send Query
                payload = {
                    "type": "chat_query",
                    "query": test["query"]
                }
                await websocket.send(json.dumps(payload))
                
                # Wait for Response (Filtering for 'ai_response')
                while True:
                    response = await websocket.recv()
                    data = json.loads(response)
                    
                    if data.get("topic") == "ai_response":
                        result = data.get("response", {})
                        text = result.get("text", "")
                        items = result.get("data", [])
                        print(f"AI Response: {text}")
                        print(f"Data Items: {len(items)}")
                        print("-" * 30 + "\n")
                        break # Go to next query
                    elif data.get("topic") == "initial_alerts":
                        # Ignore initial alerts
                        pass
                    else:
                        print(f"Ignoring unexpected topic: {data.get('topic')}\n")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_language())
