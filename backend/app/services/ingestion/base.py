"""Abstract base class for data source adapters.

Each wearable integration implements this interface. All adapters normalize
incoming data into HealthMetric rows, ensuring downstream services (baselines,
debriefs, charts) work identically regardless of source.
"""

import uuid
from abc import ABC, abstractmethod
from datetime import date

from sqlalchemy.orm import Session

from app.models.models import HealthMetric


class DataSourceAdapter(ABC):
    """Interface that every data source adapter must implement."""

    @abstractmethod
    def sync(
        self,
        db: Session,
        user_id: uuid.UUID,
        source_id: uuid.UUID,
        start_date: date,
        end_date: date,
    ) -> list[HealthMetric]:
        """
        Fetch data from the external source and upsert normalized
        HealthMetric rows for the given date range.

        Returns the list of upserted HealthMetric rows.
        """
        ...
