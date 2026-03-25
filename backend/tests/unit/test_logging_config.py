import json
import logging

from app.core.logging_config import JsonFormatter


def test_json_formatter_masks_sensitive_extra_fields():
    formatter = JsonFormatter(datefmt="%Y-%m-%d %H:%M:%S")
    record = logging.makeLogRecord(
        {
            "name": "pluvianai",
            "levelno": logging.INFO,
            "levelname": "INFO",
            "msg": "hello",
            "email": "user@example.com",
            "token": "secret-token",
            "user_id": 123,
        }
    )

    payload = json.loads(formatter.format(record))

    assert payload["message"] == "hello"
    assert payload["extra"]["email"] == "[MASKED]"
    assert payload["extra"]["token"] == "[MASKED]"
    assert payload["extra"]["user_id"] == 123
