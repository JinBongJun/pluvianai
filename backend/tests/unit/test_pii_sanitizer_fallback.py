from app.services import pii_sanitizer as pii_mod


def test_presidio_missing_model_logs_info_and_falls_back(monkeypatch):
    class BrokenAnalyzer:
        def __init__(self, *args, **kwargs):
            raise OSError(
                "Can't find model 'en_core_web_lg'. It doesn't seem to be a Python package or a valid path to a data directory."
            )

    monkeypatch.setattr(pii_mod, "PRESIDIO_AVAILABLE", True)
    monkeypatch.setattr(pii_mod, "AnalyzerEngine", BrokenAnalyzer, raising=False)
    info_messages = []
    monkeypatch.setattr(
        pii_mod.logger,
        "info",
        lambda message, *args, **kwargs: info_messages.append(str(message)),
    )

    sanitizer = pii_mod.PIISanitizer(use_presidio=True, timeout_ms=100)

    assert sanitizer.use_presidio is False
    assert "Presidio spaCy model unavailable. Using regex-only PII sanitization." in info_messages
