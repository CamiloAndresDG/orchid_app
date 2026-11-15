"""Modelo de datos y conexión (PostgreSQL en Azure, SQLite en local)."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, String, Uuid, create_engine, event
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

from .config import DATABASE_URL

_sqlite = DATABASE_URL.startswith("sqlite")
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,  # Azure cierra conexiones inactivas
    **({"connect_args": {"check_same_thread": False}} if _sqlite else {"pool_size": 5, "max_overflow": 5}),
)
if _sqlite:
    # SQLite no aplica ON DELETE CASCADE si no se le pide.
    @event.listens_for(engine, "connect")
    def _fk_on(conn, _):
        conn.execute("PRAGMA foreign_keys=ON")

SessionLocal = sessionmaker(engine, expire_on_commit=False)

JSONType = JSON().with_variant(JSONB(), "postgresql")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(d: datetime) -> datetime:
    """SQLite devuelve fechas sin zona; Postgres con zona. Normaliza a UTC."""
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
    """Sesión iniciada. Solo se guarda el SHA-256 del token, nunca el token."""
    __tablename__ = "sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    user: Mapped[User] = relationship()


class Plot(Base):
    """El terreno del agricultor y sus precios. Hoy uno por usuario (user_id único)."""
    __tablename__ = "plots"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    acres: Mapped[float | None] = mapped_column(Float)
    irrigated: Mapped[bool] = mapped_column(Boolean, default=False)
    lat: Mapped[float | None] = mapped_column(Float)
    lon: Mapped[float | None] = mapped_column(Float)
    history: Mapped[list] = mapped_column(JSONType, default=list)  # [{crop, plant_year, plant_month, harvest_year, harvest_month}]
    econ: Mapped[dict] = mapped_column(JSONType, default=dict)  # {crop: {yield, price, cost}} en unidades de EE. UU.
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    user: Mapped[User] = relationship(back_populates="plot")


def init_db() -> None:
    """Crea las tablas que falten. Para cambios de esquema futuros conviene pasar a Alembic."""
    Base.metadata.create_all(engine)


def get_db():
    with SessionLocal() as db:
        yield db
