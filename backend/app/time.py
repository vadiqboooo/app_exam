from datetime import UTC, datetime


def utcnow() -> datetime:
    """All database timestamps are naive UTC, independent of the host timezone."""
    return datetime.now(UTC).replace(tzinfo=None)
