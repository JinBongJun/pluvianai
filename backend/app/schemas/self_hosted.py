from typing import Any, Dict, List

from pydantic import BaseModel


class SentinelReport(BaseModel):
    trace_id: str
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]
    timestamp: str
