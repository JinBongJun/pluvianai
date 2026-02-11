from pydantic import BaseModel
from typing import List, Optional, Any, Dict

class TestRunCreate(BaseModel):
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]

class TestRunResponse(BaseModel):
    id: str
    status: str
    project_id: int
    results: List[Any]
