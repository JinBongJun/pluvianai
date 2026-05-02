from pydantic import BaseModel


class SimulateTrafficRequest(BaseModel):
    project_id: int
