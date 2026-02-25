import requests
import datetime
import uuid
import time
import sys

# Simulation Settings
PROJECT_ID = 1
SENTINEL_URL = "http://localhost:8000/api/v1" # Target Backend directly through local port
API_KEY = "test_key_123"

def report_to_sentinel(nodes, trace_id=None):
    if not trace_id:
        trace_id = str(uuid.uuid4())
        
    payload = {
        "trace_id": trace_id,
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "nodes": nodes,
        "edges": []
    }
    
    try:
        print(f"📡 Reporting {len(nodes)} nodes to Sentinel...")
        response = requests.post(
            f"{SENTINEL_URL}/projects/{PROJECT_ID}/sentinel/report",
            json=payload,
            headers={"X-API-KEY": API_KEY},
            timeout=5
        )
        print(f"✅ Status: {response.status_code}")
        print(f"📝 Response: {response.json()}")
        return response.json()
    except Exception as e:
        print(f"❌ Error: {e}")
        return None

if __name__ == "__main__":
    print("🧪 Pluvian Sentinel Drift Detection Mock")
    print("---------------------------------------")
    
    # 1. Report an 'Official' agent (Assuming 'Agent_Alpha_1' is in blueprint)
    # If not, it will just show as ghost too, which is fine for testing.
    nodes = [
        {
            "id": "Agent_Alpha_1",
            "type": "agentCard",
            "data": {"label": "Agent Alpha 1", "model": "gpt-4"}
        },
        {
            "id": "UNIDENTIFIED_GHOST_AGENT",
            "type": "agentCard",
            "data": {"label": "The Ghost", "model": "llama-3-secret"}
        }
    ]
    
    report_to_sentinel(nodes)
    print("\n🚀 Mock finished. Check Live View for the pulsating Amber 'GHOST' badge!")
