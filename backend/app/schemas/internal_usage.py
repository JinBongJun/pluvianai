from typing import List

from pydantic import BaseModel


class ProjectUsageItem(BaseModel):
    project_id: int | None
    project_name: str | None
    owner_email: str | None
    total_attempts: int
    runs: int


class ProjectUsageResponse(BaseModel):
    month: str
    items: List[ProjectUsageItem]
