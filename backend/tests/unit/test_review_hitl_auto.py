import pytest

from app.models.review import Review, ReviewCase
from app.models.snapshot import Snapshot
from app.models.test_lab_canvas import TestLabCanvas
from app.models.test_run import TestRun
from app.services.replay_service import ReplayService
from app.services.test_lab_service import TestLabService
from app.services.signal_detection_service import SignalDetectionService
from app.services.data_normalizer import DataNormalizer


@pytest.mark.asyncio
async def test_replay_creates_review_from_signals(db, test_project, event_loop, monkeypatch):
    """ReplayService.run_batch_replay should auto-create a Review when signals need review."""
    # Arrange: single snapshot to replay
    snapshot = Snapshot(
        project_id=test_project.id,
        trace_id="trace-1",
        agent_id="agent-1",
        provider="openai",
        model="gpt-4o-mini",
        payload={},
    )
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)

    async def fake_replay_snapshot(
        self,
        snapshot,
        new_model=None,
        new_system_prompt=None,
        api_key=None,
    ):
        # Minimal successful replay result
        return {
            "snapshot_id": snapshot.id,
            "original_model": snapshot.model,
            "replay_model": snapshot.model,
            "status_code": 200,
            "response_data": {"ok": True},
            "latency_ms": 10.0,
            "success": True,
        }

    # Force SignalEngine to always return a needs_review verdict
    def fake_detect_all_signals(
        self,
        project_id,
        response_text,
        request_data,
        response_data,
        baseline_data,
        snapshot_id,
    ):
        return {
            "status": "needs_review",
            "signal_count": 1,
            "critical_count": 0,
            "high_count": 1,
            "is_worst": False,
            "worst_status": None,
        }

    monkeypatch.setattr(ReplayService, "replay_snapshot", fake_replay_snapshot, raising=True)
    monkeypatch.setattr(SignalDetectionService, "detect_all_signals", fake_detect_all_signals, raising=True)
    monkeypatch.setattr(
        DataNormalizer,
        "_extract_response_text",
        lambda self, response_data: "replayed-response",
        raising=True,
    )

    service = ReplayService()

    # Act
    await service.run_batch_replay(
        snapshots=[snapshot],
        new_model=None,
        new_system_prompt=None,
        rubric=None,
        judge_model="gpt-4o-mini",
        project_id=test_project.id,
        db=db,
    )

    # Assert: one Review and one ReviewCase linked to the snapshot, with origin=replay
    reviews = db.query(Review).filter_by(project_id=test_project.id, origin="replay").all()
    assert len(reviews) == 1
    review = reviews[0]
    assert review.test_run_id is None
    assert review.regression_status in {"needs_review", "critical"}

    cases = db.query(ReviewCase).filter_by(review_id=review.id).all()
    assert len(cases) == 1
    case = cases[0]
    assert case.snapshot_id == snapshot.id
    assert case.test_result_id is None
    assert (case.signals or {}).get("status") == "needs_review"


@pytest.mark.asyncio
async def test_test_lab_creates_review_from_signals(db, test_project, monkeypatch):
    """TestLabService.run_chain_synchronously should auto-create a Review when signals need review."""
    # Arrange: simple canvas with a single box
    canvas = TestLabCanvas(
        id="canvas-1",
        project_id=test_project.id,
        name="Test Canvas",
        boxes=[{"id": "box-1", "model": "gpt-4o-mini", "system_prompt": "You are a test agent."}],
        connections=[],
    )
    db.add(canvas)
    db.commit()
    db.refresh(canvas)

    run = TestRun(
        project_id=test_project.id,
        name="TestLab Run",
        test_type="single",
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    # Force SignalEngine to always return a needs_review verdict
    def fake_detect_all_signals(
        self,
        project_id,
        response_text,
        request_data,
        response_data,
        baseline_data,
        snapshot_id,
    ):
        return {
            "status": "needs_review",
            "signal_count": 1,
            "critical_count": 0,
            "high_count": 1,
            "is_worst": False,
            "worst_status": None,
        }

    monkeypatch.setattr(SignalDetectionService, "detect_all_signals", fake_detect_all_signals, raising=True)

    service = TestLabService(db)

    # Act
    await service.run_chain_synchronously(
        project_id=test_project.id,
        run=run,
        canvas=canvas,
        input_prompts=["hello world"],
    )

    # Assert: one Review and one ReviewCase linked to the TestRun/TestResult, with origin=test_lab
    reviews = db.query(Review).filter_by(project_id=test_project.id, origin="test_lab").all()
    assert len(reviews) == 1
    review = reviews[0]
    assert review.test_run_id == run.id
    assert review.regression_status in {"needs_review", "critical"}

    cases = db.query(ReviewCase).filter_by(review_id=review.id).all()
    assert len(cases) == 1
    case = cases[0]
    assert case.snapshot_id is None
    assert case.test_result_id is not None
    assert (case.signals or {}).get("status") == "needs_review"

