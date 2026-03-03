"""Manual data source adapter — wraps direct metric insertion.

For MVP, this adapter simply delegates to the metrics POST endpoint logic.
It exists so the ingestion interface is consistent across all source types.
"""

import uuid
from datetime import date

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models.models import HealthMetric
from app.services.ingestion.base import DataSourceAdapter


class ManualAdapter(DataSourceAdapter):
    """Adapter for manually entered or seeded data."""

    def sync(
        self,
        db: Session,
        user_id: uuid.UUID,
        source_id: uuid.UUID,
        start_date: date,
        end_date: date,
    ) -> list[HealthMetric]:
        """
        For manual data, 'sync' returns existing metrics in the date range.
        Manual data is inserted via POST /metrics or the seed script,
        not pulled from an external API.
        """
        metrics = (
            db.query(HealthMetric)
            .filter(
                HealthMetric.user_id == user_id,
                HealthMetric.source_id == source_id,
                HealthMetric.date >= start_date,
                HealthMetric.date <= end_date,
            )
            .order_by(HealthMetric.date)
            .all()
        )
        return metrics
