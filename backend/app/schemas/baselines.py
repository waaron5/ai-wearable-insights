"""Baseline schemas — GET /baselines response."""

import uuid
from datetime import datetime

from pydantic import BaseModel


class BaselineResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    metric_type: str
    baseline_value: float
    std_deviation: float
    calculated_at: datetime

    model_config = {"from_attributes": True}
