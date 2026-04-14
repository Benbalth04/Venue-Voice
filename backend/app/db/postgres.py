import logging
import time

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from ..core.config import settings

logger = logging.getLogger(__name__)

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autoflush=False, autocommit=False, bind=engine)


@event.listens_for(engine, "before_cursor_execute")
def _before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    conn.info.setdefault("_query_start_time", []).append(time.perf_counter())


@event.listens_for(engine, "after_cursor_execute")
def _after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    start = conn.info["_query_start_time"].pop()
    latency_ms = round((time.perf_counter() - start) * 1000, 2)
    operation = statement.strip().split()[0].upper() if statement.strip() else "UNKNOWN"
    logger.info(
        "db_query",
        extra={
            "event_type": "db_query",
            "db_operation": operation,
            "latency_ms": latency_ms,
        },
    )

def get_db_connection():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()