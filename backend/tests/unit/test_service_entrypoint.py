import sys

import pytest

import service_entrypoint


@pytest.mark.unit
@pytest.mark.parametrize(
    ("raw_role", "expected_cmd", "expected_label"),
    [
        (None, [sys.executable, "start.py"], "web server"),
        ("", [sys.executable, "start.py"], "web server"),
        ("web", [sys.executable, "start.py"], "web server"),
        ("worker", [sys.executable, "-m", "app.workers.ingest_worker"], "ingest worker"),
        ("ingest", [sys.executable, "-m", "app.workers.ingest_worker"], "ingest worker"),
        (
            "release-gate-worker",
            [sys.executable, "-m", "app.workers.release_gate_worker"],
            "release gate worker",
        ),
        (
            "release_gate_worker",
            [sys.executable, "-m", "app.workers.release_gate_worker"],
            "release gate worker",
        ),
        (
            "rg",
            [sys.executable, "-m", "app.workers.release_gate_worker"],
            "release gate worker",
        ),
    ],
)
def test_resolve_service_command_maps_supported_roles(raw_role, expected_cmd, expected_label):
    role, cmd, label = service_entrypoint.resolve_service_command(raw_role)

    assert cmd == expected_cmd
    assert label == expected_label
    assert role == service_entrypoint._normalize_service_role(raw_role)


@pytest.mark.unit
def test_unknown_service_role_falls_back_to_web():
    role, cmd, label = service_entrypoint.resolve_service_command("mystery-role")

    assert role == "mystery-role"
    assert cmd == [sys.executable, "start.py"]
    assert label == "web server"
