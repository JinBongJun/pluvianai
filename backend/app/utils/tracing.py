"""
OpenTelemetry tracing helper (no-op if OTEL not configured).
"""
from __future__ import annotations

import os

try:
    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
except ImportError:  # pragma: no cover - optional dependency
    trace = None


def setup_tracing(service_name: str = "agentguard"):
    if trace is None:
        return
    if os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT") is None:
        return

    provider = TracerProvider(resource=Resource.create({"service.name": service_name}))
    processor = BatchSpanProcessor(OTLPSpanExporter())
    provider.add_span_processor(processor)
    trace.set_tracer_provider(provider)


def get_tracer(name: str = "agentguard"):
    if trace is None:
        return None
    return trace.get_tracer(name)
