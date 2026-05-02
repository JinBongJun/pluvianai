from typing import Optional

from pydantic import BaseModel, Field


class FeedbackPayload(BaseModel):
    message: str = Field(..., min_length=5, max_length=5000)
    page: Optional[str] = Field(
        default=None,
        description="Optional path or context where the feedback was sent from.",
    )
