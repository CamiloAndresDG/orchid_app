"""Cuentas, sesiones y el cuaderno (terreno y precios) de cada agricultor."""
import hashlib
import hmac
import re
import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import SESSION_DAYS
from .db import AuthSession, Plot, User, as_utc, get_db, utcnow

router = APIRouter()
bearer = HTTPBearer(auto_error=False)

# ---------- Contraseñas y tokens ----------

_SCRYPT = {"n": 2**14, "r": 8, "p": 1, "dklen": 32}


def hash_password(pw: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(pw.encode(), salt=salt, **_SCRYPT)
    return f"scrypt${_SCRYPT['n']}${_SCRYPT['r']}${_SCRYPT['p']}${salt.hex()}${dk.hex()}"


def verify_password(pw: str, stored: str) -> bool:
    try:
        _, n, r, p, salt, dk = stored.split("$")
        got = hashlib.scrypt(pw.encode(), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p), dklen=len(dk) // 2)
        return hmac.compare_digest(got.hex(), dk)
    except ValueError:
        return False


# Para que un correo inexistente tarde lo mismo que una contraseña equivocada.
_DUMMY_HASH = hash_password(secrets.token_hex(8))


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _new_session(db: Session, user: User) -> str:
    token = secrets.token_urlsafe(32)
    now = utcnow()
    db.execute(delete(AuthSession).where(AuthSession.expires_at < now))  # limpieza de vencidas
    db.add(AuthSession(token_hash=_token_hash(token), user_id=user.id, created_at=now, expires_at=now + timedelta(days=SESSION_DAYS)))
    db.commit()
    return token


def current_user(cred: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> User:
    if cred is None:
        raise HTTPException(401, "Inicia sesión para continuar.")
    s = db.get(AuthSession, _token_hash(cred.credentials))
    if s is None or as_utc(s.expires_at) < utcnow():
        raise HTTPException(401, "Tu sesión venció. Vuelve a iniciar sesión.")
    return s.user


# ---------- Esquemas ----------

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class Login(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(min_length=1, max_length=200)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip().lower()
        if not EMAIL_RE.match(v):
            raise ValueError("Escribe un correo válido.")
        return v


class Register(Login):
    name: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=8, max_length=200)


class UserOut(BaseModel):
    name: str
    email: str


class AuthOut(BaseModel):
    token: str
    user: UserOut


class HistoryRow(BaseModel):
    crop: str = Field(max_length=40)
    plant_year: int = Field(ge=1950, le=2100)
    plant_month: int = Field(ge=1, le=12)
    harvest_year: int = Field(ge=1950, le=2100)
    harvest_month: int = Field(ge=1, le=12)


class Econ(BaseModel):
    yield_: str = Field("", alias="yield", max_length=20)
    price: str = Field("", max_length=20)
    cost: str = Field("", max_length=20)

    model_config = {"populate_by_name": True}


class PointIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class PlotIn(BaseModel):
    """Mismo formato que usa el frontend (acres como texto, tal cual lo escribe la persona)."""
    name: str = Field("", max_length=120)
    acres: str = Field("", max_length=20)
    irrigated: bool = False
    point: PointIn | None = None
    history: list[HistoryRow] = Field(default_factory=list, max_length=100)


class Notebook(BaseModel):
    plot: PlotIn | None = None
    econ: dict[str, Econ] = Field(default_factory=dict, max_length=30)


# ---------- Endpoints ----------


def _user_out(u: User) -> UserOut:
    return UserOut(name=u.name, email=u.email)


@router.post("/auth/register", response_model=AuthOut, status_code=201)
def register(req: Register, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.email == req.email)):
        raise HTTPException(409, "Ya existe una cuenta con ese correo. Inicia sesión.")
    user = User(email=req.email, name=req.name.strip(), password_hash=hash_password(req.password))
    db.add(user)
    try:
        db.flush()
    except IntegrityError:  # dos registros simultáneos con el mismo correo
        db.rollback()
        raise HTTPException(409, "Ya existe una cuenta con ese correo. Inicia sesión.")
    return AuthOut(token=_new_session(db, user), user=_user_out(user))


@router.post("/auth/login", response_model=AuthOut)
def login(req: Login, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == req.email))
    ok = verify_password(req.password, user.password_hash if user else _DUMMY_HASH)
    if not user or not ok:
        raise HTTPException(401, "Correo o contraseña incorrectos.")
    return AuthOut(token=_new_session(db, user), user=_user_out(user))


@router.post("/auth/logout", status_code=204)
def logout(cred: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)):
    if cred:
        db.execute(delete(AuthSession).where(AuthSession.token_hash == _token_hash(cred.credentials)))
        db.commit()


@router.get("/auth/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return _user_out(user)


def _acres(v: str) -> float | None:
    try:
        x = float(v.replace(",", "."))
        return x if 0 < x < 1e7 else None
    except ValueError:
        return None


@router.get("/me/notebook")
def get_notebook(user: User = Depends(current_user)):
    p = user.plot
    if p is None:
        return {"plot": None, "econ": {}, "updated_at": None}
    return {
        "plot": {
            "name": p.name,
            "acres": "" if p.acres is None else f"{p.acres:g}",
            "irrigated": p.irrigated,
            "point": {"lat": p.lat, "lon": p.lon} if p.lat is not None and p.lon is not None else None,
            "history": p.history or [],
        },
        "econ": p.econ or {},
        "updated_at": p.updated_at,
    }


@router.put("/me/notebook")
def put_notebook(nb: Notebook, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = user.plot or Plot(user_id=user.id)
    if nb.plot is not None:
        p.name = nb.plot.name.strip()
        p.acres = _acres(nb.plot.acres)
        p.irrigated = nb.plot.irrigated
        p.lat = nb.plot.point.lat if nb.plot.point else None
        p.lon = nb.plot.point.lon if nb.plot.point else None
        p.history = [h.model_dump() for h in nb.plot.history]
    p.econ = {k: v.model_dump(by_alias=True) for k, v in nb.econ.items()}
    db.add(p)
    db.commit()
    return {"ok": True, "updated_at": p.updated_at}


@router.delete("/me", status_code=204)
def delete_account(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Borra la cuenta, sus sesiones y su terreno."""
    db.delete(user)
    db.commit()
