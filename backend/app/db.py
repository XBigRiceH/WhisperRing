"""SQLite storage via SQLModel: table models + engine/session helpers + tiny
id/time utilities.

The models mirror the previous raw-SQL schema 1:1 (identical table and column
names) so existing ring.db files stay compatible. API response DTOs still live
in schemas.py; the classes here are the persistence layer only.
"""
import time
import uuid
from contextlib import contextmanager
from typing import Iterator, Optional

from sqlalchemy import UniqueConstraint, event, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.schema import CreateColumn
from sqlmodel import Field, Session, SQLModel, create_engine

from .config import settings


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: str = Field(primary_key=True)
    label: Optional[str] = None
    nickname: Optional[str] = None
    created_at: Optional[int] = None


class Ring(SQLModel, table=True):
    __tablename__ = "rings"

    id: str = Field(primary_key=True)
    mac: Optional[str] = Field(default=None, unique=True)
    sn: Optional[str] = Field(default=None, unique=True)
    cpuid: Optional[str] = None
    model: Optional[str] = None
    firmware: Optional[str] = None
    owner_user_id: Optional[str] = None
    unique_no: Optional[str] = None
    bound_at: Optional[int] = None
    last_battery: Optional[int] = None
    last_seen_at: Optional[int] = None


class Couple(SQLModel, table=True):
    __tablename__ = "couples"

    id: str = Field(primary_key=True)
    user_a_id: Optional[str] = None
    user_b_id: Optional[str] = None
    unique_code: Optional[str] = None
    chatlab_session: Optional[str] = None
    status: Optional[str] = None
    paired_at: Optional[int] = None


class InviteCode(SQLModel, table=True):
    __tablename__ = "invite_codes"

    code: str = Field(primary_key=True)
    inviter_user_id: Optional[str] = None
    expires_at: Optional[int] = None
    consumed: int = Field(default=0)


class MissYouEvent(SQLModel, table=True):
    __tablename__ = "miss_you_events"

    id: str = Field(primary_key=True)
    couple_id: Optional[str] = None
    from_user_id: Optional[str] = None
    to_user_id: Optional[str] = None
    trigger_type: Optional[str] = None
    memory_item_id: Optional[str] = None
    created_at: Optional[int] = None
    delivered_at: Optional[int] = None
    read_at: Optional[int] = None


class MemoryItem(SQLModel, table=True):
    __tablename__ = "memory_items"

    id: str = Field(primary_key=True)
    couple_id: Optional[str] = None
    type: Optional[str] = None
    content: Optional[str] = None
    created_at: Optional[int] = None


class VoiceRecord(SQLModel, table=True):
    __tablename__ = "voice_records"
    __table_args__ = (UniqueConstraint("ring_id", "file_index"),)

    id: str = Field(primary_key=True)
    ring_id: Optional[str] = None
    user_id: Optional[str] = None
    couple_id: Optional[str] = None
    file_index: Optional[int] = None
    record_time: Optional[int] = None
    raw_bin_path: Optional[str] = None
    wav_path: Optional[str] = None
    duration_ms: Optional[int] = None
    asr_text: Optional[str] = None
    asr_status: Optional[str] = None
    chatlab_pushed: int = Field(default=0)
    created_at: Optional[int] = None


class Companion(SQLModel, table=True):
    __tablename__ = "companions"

    ai_user_id: str = Field(primary_key=True)  # = 那条 AI User 的 id
    owner_user_id: Optional[str] = None
    name: Optional[str] = None
    gender: Optional[str] = None  # female | male | neutral
    traits: Optional[str] = None  # 逗号分隔的标签 key，如 "gentle,clingy"
    system_prompt: Optional[str] = None  # 渲染后的完整 system prompt
    created_at: Optional[int] = None


class CompanionMessage(SQLModel, table=True):
    __tablename__ = "companion_messages"

    id: str = Field(primary_key=True)
    couple_id: Optional[str] = None
    role: Optional[str] = None  # user | ai
    sender_user_id: Optional[str] = None
    text: Optional[str] = None
    created_at: Optional[int] = None


class RecallMessage(SQLModel, table=True):
    __tablename__ = "recall_messages"

    id: str = Field(primary_key=True)
    couple_id: Optional[str] = None
    role: Optional[str] = None  # user | ai
    text: Optional[str] = None
    created_at: Optional[int] = None


class Recording(SQLModel, table=True):
    __tablename__ = "recordings"

    id: str = Field(primary_key=True)
    user_id: Optional[str] = None
    original_filename: Optional[str] = None
    bin_path: Optional[str] = None
    wav_path: Optional[str] = None
    bin_size: Optional[int] = None
    wav_size: Optional[int] = None
    duration_ms: Optional[int] = None
    source_type: Optional[str] = None
    decode_status: Optional[str] = None
    decode_error: Optional[str] = None
    uploaded_at: Optional[int] = None
    # Background ASR result, linked to this recording by its primary key.
    asr_text: Optional[str] = None
    asr_status: Optional[str] = None  # pending | done | failed (None if not queued)
    asr_error: Optional[str] = None
    # 1 once the transcript was successfully pushed into a ChatLab session.
    # server_default keeps the column NOT NULL-safe when backfilled onto
    # existing rows (SQLite rejects a NOT NULL add without a default).
    chatlab_pushed: int = Field(default=0, sa_column_kwargs={"server_default": text("0")})


def now_ms() -> int:
    return int(time.time() * 1000)


def new_id(prefix: str = "") -> str:
    return f"{prefix}{uuid.uuid4().hex}"


# Engines are cached per db path so tests (which point DB_PATH at a fresh tmp
# file per case) get an isolated engine instead of a stale global one.
_engines: dict[str, Engine] = {}


@event.listens_for(Engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _record) -> None:
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA foreign_keys = ON")
    cur.close()


def _engine() -> Engine:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    path = settings.db_path
    engine = _engines.get(path)
    if engine is None:
        engine = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})
        _engines[path] = engine
    return engine


def init_db() -> None:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    engine = _engine()
    SQLModel.metadata.create_all(engine)
    _backfill_missing_columns(engine, Recording)
    _backfill_missing_columns(engine, Companion)
    _backfill_missing_columns(engine, CompanionMessage)
    _backfill_missing_columns(engine, RecallMessage)


def _backfill_missing_columns(engine: Engine, model: type[SQLModel]) -> None:
    # create_all never alters existing tables, so older ring.db files still miss
    # columns added to the model later. Introspect via SQLAlchemy's Inspector and
    # add any missing columns, compiling the DDL straight from the ORM model
    # definition (no hand-written SQL types).
    table = model.__table__
    existing = {col["name"] for col in inspect(engine).get_columns(table.name)}
    missing = [column for column in table.columns if column.name not in existing]
    if not missing:
        return
    with engine.begin() as conn:
        for column in missing:
            spec = CreateColumn(column).compile(dialect=engine.dialect)
            conn.execute(text(f"ALTER TABLE {table.name} ADD COLUMN {spec}"))


@contextmanager
def get_session() -> Iterator[Session]:
    # expire_on_commit=False keeps returned objects usable after the session
    # closes, so callers can read attributes without a DetachedInstanceError.
    session = Session(_engine(), expire_on_commit=False)
    try:
        yield session
        session.commit()
    finally:
        session.close()
