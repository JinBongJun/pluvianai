"""
Logging configuration for AgentGuard
"""

import logging
import sys
import json
from logging.handlers import RotatingFileHandler
from pathlib import Path
from app.core.config import settings

LOG_DIR = Path("logs")
LOG_DIR.mkdir(exist_ok=True)

logger = logging.getLogger("agentguard")
logger.setLevel(logging.DEBUG if settings.DEBUG else logging.INFO)
logger.handlers.clear()


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "funcName": record.funcName,
            "line": record.lineno,
        }
        # Mask obvious sensitive fields if present in extra
        if hasattr(record, "extra"):
            extra = getattr(record, "extra") or {}
            masked = {}
            for k, v in extra.items():
                if k.lower() in {"password", "token", "authorization", "secret", "api_key"}:
                    masked[k] = "[MASKED]"
                else:
                    masked[k] = v
            payload["extra"] = masked
        return json.dumps(payload)


json_formatter = JsonFormatter(datefmt="%Y-%m-%d %H:%M:%S")
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.INFO)
console_handler.setFormatter(json_formatter)
logger.addHandler(console_handler)

file_handler = RotatingFileHandler(LOG_DIR / "agentguard.log", maxBytes=10 * 1024 * 1024, backupCount=5)
file_handler.setLevel(logging.DEBUG)
file_handler.setFormatter(json_formatter)
logger.addHandler(file_handler)

error_handler = RotatingFileHandler(LOG_DIR / "errors.log", maxBytes=10 * 1024 * 1024, backupCount=5)
error_handler.setLevel(logging.ERROR)
error_handler.setFormatter(json_formatter)
logger.addHandler(error_handler)

logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
