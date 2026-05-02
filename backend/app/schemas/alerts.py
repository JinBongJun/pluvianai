from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class AlertResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    alert_type: str
    severity: str
    title: str
    message: str  # API contract; Alert model exposes via message property from description
    is_resolved: bool
    resolved_at: Optional[datetime] = None
    created_at: datetime
