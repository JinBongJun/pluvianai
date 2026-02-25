import json
import requests
import datetime
import uuid
from typing import List, Dict, Any, Optional

class PluvianMonitor:
    """
    Deterministic Neural Hook for PluvianAI Sentinel.
    Enables agents to explicitly declare their positions and links.
    """
    def __init__(self, project_id: int, api_key: str, sentinel_url: str = "http://localhost:5678"):
        self.project_id = project_id
        self.api_key = api_key
        self.sentinel_url = sentinel_url
        self.active_trace = str(uuid.uuid4())

    def report_step(self, agent_name: str, model: str, input_data: Any, output_data: Any, links: List[str] = []):
        """
        Reports an agent execution step to the local Sentinel.
        """
        payload = {
            "trace_id": self.active_trace,
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "nodes": [
                {
                    "id": agent_name,
                    "type": "agentCard",
                    "data": {
                        "label": agent_name,
                        "model": model,
                    }
                }
            ],
            "edges": [
                {"source": agent_name, "target": target} for target in links
            ]
        }
        
        try:
            response = requests.post(
                f"{self.sentinel_url}/projects/{self.project_id}/sentinel/report",
                json=payload,
                headers={"X-API-KEY": self.api_key},
                timeout=2
            )
            return response.status_code == 200
        except Exception:
            # Fail silently to avoid blocking agent execution
            return False

# Usage Example:
# monitor = PluvianMonitor(project_id=1, api_key="sk-...")
# monitor.report_step("Agent_Alpha", "gpt-4", "Hello", "Hi there!", links=["Agent_Beta"])
