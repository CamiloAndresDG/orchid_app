"""Data model and connection (PostgreSQL on Azure, SQLite locally)."""
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Uuid, create_engine, event
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

from .config import DATABASE_URL

_sqlite = DATABASE_URL.startswith("sqlite")
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,  # Azure closes idle connections
    **({"connect_args": {"check_same_thread": False}} if _sqlite else {"pool_size": 5, "max_overflow": 5}),
)
if _sqlite:
    # SQLite doesn't enforce ON DELETE CASCADE unless asked to.
    @event.listens_for(engine, "connect")
    def _fk_on(conn, _):
        conn.execute("PRAGMA foreign_keys=ON")

SessionLocal = sessionmaker(engine, expire_on_commit=False)

JSONType = JSON().with_variant(JSONB(), "postgresql")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(d: datetime) -> datetime:
    """SQLite returns naive datetimes; Postgres returns them with a zone. Normalizes to UTC."""
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(80))
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    plot: Mapped["Plot | None"] = relationship(back_populates="user", cascade="all, delete-orphan", uselist=False)


class AuthSession(Base):
    """Signed-in session. Only the token's SHA-256 is stored, never the token."""
    __tablename__ = "sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    user: Mapped[User] = relationship()


class Plot(Base):
    """The farmer's field and prices. One per user for now (unique user_id)."""
    __tablename__ = "plots"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    acres: Mapped[float | None] = mapped_column(Float)
    irrigated: Mapped[bool] = mapped_column(Boolean, default=False)
    lat: Mapped[float | None] = mapped_column(Float)
    lon: Mapped[float | None] = mapped_column(Float)
    history: Mapped[list] = mapped_column(JSONType, default=list)  # [{crop, plant_year, plant_month, harvest_year, harvest_month}]
    econ: Mapped[dict] = mapped_column(JSONType, default=dict)  # {crop: {yield, price, cost}} in U.S. units
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    user: Mapped[User] = relationship(back_populates="plot")


class AssistantUsage(Base):
    """Questions to the Guide per user and day (daily limit)."""
    __tablename__ = "assistant_usage"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    count: Mapped[int] = mapped_column(Integer, default=0)


def init_db() -> None:
    """Creates any missing tables. For future schema changes, moving to Alembic is advisable."""
    Base.metadata.create_all(engine)


def get_db():
    with SessionLocal() as db:
        yield db
