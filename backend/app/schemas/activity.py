from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class ActivityItem(BaseModel):
    """Activity log item"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: Optional[int]
    action: str
    resource_type: Optional[str]
    resource_id: Optional[int]
    old_value: Optional[dict]
    new_value: Optional[dict]
    ip_address: Optional[str]
    created_at: datetime
