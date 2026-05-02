from pydantic import BaseModel, HttpUrl


class CheckoutRequest(BaseModel):
    plan_type: str
    success_url: HttpUrl
    cancel_url: HttpUrl


class ChangePlanRequest(BaseModel):
    plan_type: str
