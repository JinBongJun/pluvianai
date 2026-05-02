from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class EvaluationRequest(BaseModel):
    api_call_id: int
    expected_schema: Optional[Dict[str, Any]] = None
    required_fields: Optional[List[str]] = None
    use_advanced: bool = False
