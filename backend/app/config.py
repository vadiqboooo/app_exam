import os
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_ROOT = Path(sys.executable).parent if getattr(sys, "frozen", False) else ROOT
STATIC_ROOT = ROOT / "frontend" if getattr(sys, "frozen", False) else ROOT.parent / "frontend/dist"


@dataclass(frozen=True)
class Settings:
    database_url: str = field(
        default_factory=lambda: os.getenv(
            "DATABASE_URL", f"sqlite:///{(DATA_ROOT / 'data/probnik.db').as_posix()}"
        )
    )
    api_key: str = field(default_factory=lambda: os.getenv("API_KEY", ""))
