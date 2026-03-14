"""
Logging configuration for PluvianAI
"""

import logging
import sys
import json
from logging.handlers import RotatingFileHandler
from pathlib import Path
from app.core.config import settings

LOG_DIR = Path("logs")
LOG_DIR.mkdir(exist_ok=True)

logger = logging.getLogger("pluvianai")
logger.setLevel(logging.DEBUG if settings.DEBUG else logging.INFO)
logger.handlers.clear()
STANDARD_LOG_RECORD_ATTRS = frozenset(logging.makeLogRecord({}).__dict__.keys())
SENSITIVE_EXTRA_KEYS = {
    "password",
    "token",
    "authorization",
    "secret",
    "api_key",
    "access_token",
    "refresh_token",
    "email",
    "cookie",
}


class JsonFormatter(logging.Formatter):
    def _extract_extra(self, record: logging.LogRecord) -> dict:
        return {
            key: value
            for key, value in record.__dict__.items()
            if key not in STANDARD_LOG_RECORD_ATTRS and not key.startswith("_")
        }

    def _mask_extra(self, extra: dict) -> dict:
        masked = {}
        for key, value in extra.items():
            if key.lower() in SENSITIVE_EXTRA_KEYS:
                masked[key] = "[MASKED]"
            else:
                masked[key] = value
        return masked

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
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        extra = self._extract_extra(record)
        if extra:
            payload["extra"] = self._mask_extra(extra)
        return json.dumps(payload)


json_formatter = JsonFormatter(datefmt="%Y-%m-%d %H:%M:%S")
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.DEBUG)
console_handler.setFormatter(json_formatter)
logger.addHandler(console_handler)

file_handler = RotatingFileHandler(LOG_DIR / "pluvianai.log", maxBytes=10 * 1024 * 1024, backupCount=5)
file_handler.setLevel(logging.DEBUG)
file_handler.setFormatter(json_formatter)
logger.addHandler(file_handler)

error_handler = RotatingFileHandler(LOG_DIR / "errors.log", maxBytes=10 * 1024 * 1024, backupCount=5)
error_handler.setLevel(logging.ERROR)
error_handler.setFormatter(json_formatter)
logger.addHandler(error_handler)

logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
