from typing import Any, Dict, List, Optional, Tuple

import json
import time

import httpx
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.api.v1.endpoints.proxy import PROVIDER_URLS
from app.core.config import settings
from app.core.logging_config import logger
from app.models.test_lab_canvas import TestLabCanvas
from app.models.test_run import TestRun
from app.models.test_result import TestResult
from app.models.alert import Alert
from app.services.signal_detection_service import SignalDetectionService
from app.services.review_service import ReviewService
from app.services.data_normalizer import DataNormalizer


MAX_BOXES_PER_CANVAS = 30


class TestLabService:
    """
    Core Test Lab service.

    This service is intentionally conservative for a first iteration:
    - Provides canvas CRUD aligned with TestLabCanvas schema.
    - Exposes helpers for querying/saving TestResult / TestRun for API use.
    - Leaves full chain execution + SignalEngine integration to a dedicated
      runner that can be layered on top (see Phase 5.3 / backend-chain-runner todo).
    """

    def __init__(self, db: Session) -> None:
        self.db = db

    # ------------------------------------------------------------------
    # Canvas helpers
    # ------------------------------------------------------------------
    def list_canvases(self, project_id: int) -> List[TestLabCanvas]:
        return (
            self.db.query(TestLabCanvas)
            .filter(TestLabCanvas.project_id == project_id)
            .order_by(TestLabCanvas.created_at.desc())
            .all()
        )

    def get_canvas(self, project_id: int, canvas_id: str) -> Optional[TestLabCanvas]:
        return (
            self.db.query(TestLabCanvas)
            .filter(
                TestLabCanvas.project_id == project_id,
                TestLabCanvas.id == canvas_id,
            )
            .first()
        )

    def _validate_boxes_limit(self, boxes: Optional[List[Dict[str, Any]]]) -> None:
        if boxes is None:
            return
        if len(boxes) > MAX_BOXES_PER_CANVAS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Test Lab canvas exceeds maximum of {MAX_BOXES_PER_CANVAS} boxes "
                    f"(requested: {len(boxes)}). See design §2.2 / §8.3."
                ),
            )

    def create_canvas(
        self,
        project_id: int,
        name: str,
        boxes: Optional[List[Dict[str, Any]]] = None,
        connections: Optional[List[Dict[str, Any]]] = None,
    ) -> TestLabCanvas:
        self._validate_boxes_limit(boxes or [])

        canvas = TestLabCanvas(
            project_id=project_id,
            name=name,
            boxes=boxes or [],
            connections=connections or [],
        )
        self.db.add(canvas)
        self.db.commit()
        self.db.refresh(canvas)
        return canvas

    def update_canvas(
        self,
        project_id: int,
        canvas_id: str,
        name: Optional[str] = None,
        boxes: Optional[List[Dict[str, Any]]] = None,
        connections: Optional[List[Dict[str, Any]]] = None,
    ) -> TestLabCanvas:
        canvas = self.get_canvas(project_id, canvas_id)
        if not canvas:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Canvas not found",
            )

        if boxes is not None:
            self._validate_boxes_limit(boxes)
            canvas.boxes = boxes
        if connections is not None:
            canvas.connections = connections
        if name is not None:
            canvas.name = name

        self.db.commit()
        self.db.refresh(canvas)
        return canvas

    # ------------------------------------------------------------------
    # Chain execution (Phase 5.3 - minimal synchronous runner)
    # ------------------------------------------------------------------

    def _build_box_index(
        self, boxes: List[Dict[str, Any]]
    ) -> Dict[str, Dict[str, Any]]:
        index: Dict[str, Dict[str, Any]] = {}
        for box in boxes:
            box_id = str(box.get("id") or "")
            if not box_id:
                continue
            index[box_id] = box
        return index

    def _infer_edge_nodes(
        self, edge: Dict[str, Any]
    ) -> Tuple[Optional[str], Optional[str]]:
        """
        Support a few common edge key patterns from the design:
        - source / target
        - from / to
        """
        source = edge.get("source") or edge.get("from")
        target = edge.get("target") or edge.get("to")
        return (
            str(source) if source is not None else None,
            str(target) if target is not None else None,
        )

    def _topological_sort_boxes(
        self,
        boxes: List[Dict[str, Any]],
        connections: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """
        Compute a best-effort topological ordering over boxes based on connections.

        If the graph is incomplete or cyclic, falls back to original order
        for any remaining boxes.
        """
        if not boxes:
            return []

        box_index = self._build_box_index(boxes)
        indegree: Dict[str, int] = {box_id: 0 for box_id in box_index.keys()}
        graph: Dict[str, List[str]] = {box_id: [] for box_id in box_index.keys()}

        for edge in connections or []:
            src, dst = self._infer_edge_nodes(edge)
            if not src or not dst:
                continue
            if src not in box_index or dst not in box_index:
                continue
            graph[src].append(dst)
            indegree[dst] += 1

        # Kahn's algorithm
        queue: List[str] = [box_id for box_id, deg in indegree.items() if deg == 0]
        ordered_ids: List[str] = []

        while queue:
            current = queue.pop(0)
            ordered_ids.append(current)
            for neighbor in graph.get(current, []):
                indegree[neighbor] -= 1
                if indegree[neighbor] == 0:
                    queue.append(neighbor)

        # Fallback: append any boxes that were not visited
        for box in boxes:
            box_id = str(box.get("id") or "")
            if box_id and box_id not in ordered_ids:
                ordered_ids.append(box_id)

        return [box_index[box_id] for box_id in ordered_ids if box_id in box_index]

    async def _call_llm_for_box_input(
        self,
        client: httpx.AsyncClient,
        *,
        project_id: int,
        box: Dict[str, Any],
        prompt: str,
    ) -> Tuple[bool, str, Optional[float], Optional[int], Optional[float], Optional[Dict[str, Any]]]:
        """
        Execute a single LLM call for a given box + input prompt.

        Returns:
            (success, response_text, latency_ms, tokens_used, cost, error_details)
        """
        provider = (box.get("provider") or "openai").lower()
        model = box.get("model") or "gpt-4o-mini"
        system_prompt = box.get("system_prompt") or ""
        custom_api_key = box.get("custom_api_key") or None
        base_url_override = box.get("base_url") or None

        # Infer provider from model when provider is "custom" or missing
        normalizer = DataNormalizer()
        if provider == "custom" or provider not in PROVIDER_URLS:
            inferred_provider = normalizer._detect_provider_from_model(model)
            provider = inferred_provider if inferred_provider in PROVIDER_URLS else "openai"

        base_url = base_url_override or PROVIDER_URLS.get(provider)
        if not base_url:
            # Fallback to OpenAI if provider is unknown
            provider = "openai"
            base_url = PROVIDER_URLS["openai"]

        # Build provider-specific URL and payload
        url: str
        payload: Dict[str, Any]

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        if provider == "openai":
            url = f"{base_url}/chat/completions"
            payload = {
                "model": model,
                "messages": messages,
                "stream": False,
            }
        elif provider == "anthropic":
            # Anthropic Messages API
            url = f"{base_url}/messages"
            payload = {
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
            }
            if system_prompt:
                payload["system"] = system_prompt
        elif provider == "google":
            # Gemini-style endpoint
            url = f"{base_url}/models/{model}:generateContent"
            prompt_text = f"{system_prompt}\n\n{prompt}" if system_prompt else prompt
            payload = {
                "contents": [
                    {
                        "parts": [
                            {
                                "text": prompt_text,
                            }
                        ]
                    }
                ]
            }
        else:
            # Default to OpenAI-compatible
            url = f"{base_url}/chat/completions"
            payload = {
                "model": model,
                "messages": messages,
                "stream": False,
            }

        # Auth: prefer box-level BYOK key when provided, else fallback to global keys
        api_key: Optional[str] = None
        if custom_api_key:
            api_key = custom_api_key
        else:
            if provider == "openai" and settings.OPENAI_API_KEY:
                api_key = settings.OPENAI_API_KEY
            elif provider == "anthropic" and settings.ANTHROPIC_API_KEY:
                api_key = settings.ANTHROPIC_API_KEY
            elif provider == "google" and settings.GOOGLE_API_KEY:
                api_key = settings.GOOGLE_API_KEY

        if not api_key:
            error_msg = f"API key for provider '{provider}' is not configured."
            logger.warning(
                "Test Lab LLM call skipped due to missing API key",
                extra={"project_id": project_id, "provider": provider},
            )
            return (
                False,
                f"[Test Lab LLM error] {error_msg}",
                None,
                None,
                None,
                {
                    "reason": "missing_api_key",
                    "provider": provider,
                    "message": error_msg,
                },
            )

        headers: Dict[str, str] = {
            "Content-Type": "application/json",
        }
        if provider == "openai":
            headers["Authorization"] = f"Bearer {api_key}"
        elif provider == "anthropic":
            headers["x-api-key"] = api_key
            headers["anthropic-version"] = "2023-06-01"
        elif provider == "google":
            headers["x-goog-api-key"] = api_key

        start = time.monotonic()
        try:
            response = await client.post(url, headers=headers, json=payload)
            latency_ms = (time.monotonic() - start) * 1000.0
        except Exception as exc:
            logger.error(
                "Test Lab LLM call failed",
                extra={"project_id": project_id, "provider": provider, "error": str(exc)},
            )
            return (
                False,
                "[Test Lab LLM error] Upstream request failed. Please try again.",
                None,
                None,
                None,
                {
                    "reason": "network_error",
                    "provider": provider,
                    "message": str(exc),
                },
            )

        # Handle non-2xx errors gracefully and attach provider error details
        raw_text = response.text
        error_details: Optional[Dict[str, Any]] = None
        if response.status_code >= 400:
            user_message = "LLM request failed. Please check your model and API key configuration."
            try:
                data = response.json()
                # Common error envelope shapes
                error_obj = data.get("error") if isinstance(data, dict) else None
                if isinstance(error_obj, dict):
                    msg = error_obj.get("message") or error_obj.get("detail")
                    if isinstance(msg, str):
                        user_message = msg
                error_details = {
                    "status_code": response.status_code,
                    "provider": provider,
                    "error": data,
                }
            except Exception:
                error_details = {
                    "status_code": response.status_code,
                    "provider": provider,
                    "error_text": raw_text[:2000],
                }

            return (
                False,
                f"[Test Lab LLM error] {user_message}",
                latency_ms,
                None,
                None,
                {
                    "reason": "provider_error",
                    "provider": provider,
                    "status_code": response.status_code,
                    "details": error_details,
                },
            )

        # Successful response: normalize and extract text + metrics
        try:
            data = response.json()
        except Exception:
            # Fallback: use raw text
            response_text = raw_text[:4000] if raw_text else ""
            return True, response_text, latency_ms, None, None, None

        normalized = normalizer.normalize(request_data=payload, response_data=data, url=url)
        response_text = normalized.get("response_text") or ""
        if not response_text:
            # Fallback to raw JSON when normalizer can't extract text
            response_text = json.dumps(data)[:4000]

        tokens_used = normalized.get("response_tokens")
        if tokens_used is None:
            tokens_used = normalized.get("request_tokens")

        # Cost calculation is left to future phases; store None for now.
        cost: Optional[float] = None

        return True, response_text, latency_ms, tokens_used, cost, None

    async def run_chain_synchronously(
        self,
        project_id: int,
        run: TestRun,
        canvas: TestLabCanvas,
        input_prompts: Optional[List[str]] = None,
        target_box_ids: Optional[List[str]] = None,
    ) -> None:
        """
        Minimal synchronous chain runner that executes real LLM calls
        for each box/input combination and wires results through
        SignalEngine, Worst marking, Alerts and Review creation.
        """
        boxes = canvas.boxes or []
        if target_box_ids:
            # Filter to selected boxes only (by id), keeping original order
            target_set = {str(bid) for bid in target_box_ids}
            boxes = [b for b in boxes if str(b.get("id") or "") in target_set]
        connections = canvas.connections or []

        if not boxes:
            # No work to do – mark run as completed with zero counts.
            run.total_count = 0
            run.pass_count = 0
            run.fail_count = 0
            run.status = "completed"
            self.db.add(run)
            self.db.commit()
            self.db.refresh(run)
            return

        ordered_boxes = self._topological_sort_boxes(boxes, connections)
        if not ordered_boxes:
            ordered_boxes = boxes

        global_prompts = input_prompts or [""]

        step_counter = 0
        results_created = 0
        pass_count = 0
        fail_count = 0

        signal_service = SignalDetectionService(self.db)
        review_service = ReviewService(self.db)
        review_items: List[Dict[str, Any]] = []

        # Simple parent mapping: for each edge, remember parent for child
        parent_map: Dict[str, str] = {}
        for edge in connections or []:
            src, dst = self._infer_edge_nodes(edge)
            if src and dst:
                parent_map[dst] = src

        client_timeout = httpx.Timeout(60.0)

        try:
            async with httpx.AsyncClient(timeout=client_timeout) as client:
                for box in ordered_boxes:
                    box_id = str(box.get("id") or "")
                    agent_id = box_id or box.get("agent_id") or None
                    system_prompt = box.get("system_prompt")
                    model = box.get("model")

                    # Per-box inputs: fall back to global prompts when not provided
                    box_inputs = box.get("inputs")
                    if isinstance(box_inputs, list):
                        # Normalize to list[str]
                        prompts = [str(p) for p in box_inputs if str(p).strip()]
                    else:
                        prompts = global_prompts

                    for idx, prompt in enumerate(prompts):

                        step_counter += 1
                        parent_step_id: Optional[str] = None
                        if box_id and box_id in parent_map:
                            # naive parent resolution: use parent box id as logical parent_step_id
                            parent_step_id = parent_map[box_id]

                        (
                            success,
                            response_text,
                            latency_ms,
                            tokens_used,
                            cost,
                            error_details,
                        ) = await self._call_llm_for_box_input(
                            client,
                            project_id=project_id,
                            box=box,
                            prompt=prompt,
                        )

                        result = TestResult(
                            project_id=project_id,
                            agent_id=agent_id,
                            test_run_id=run.id,
                            step_order=step_counter,
                            parent_step_id=parent_step_id,
                            is_parallel=False,
                            input=prompt,
                            system_prompt=system_prompt,
                            model=model,
                            response=response_text,
                            latency_ms=int(latency_ms) if latency_ms is not None else None,
                            tokens_used=tokens_used,
                            cost=cost,
                            signal_result=None,
                            is_worst=False,
                            worst_status=None,
                            baseline_snapshot_id=None,
                            baseline_response=None,
                            source="test_lab",
                        )

                        # Build response_data payload for SignalEngine
                        response_data = {
                            "latency_ms": result.latency_ms,
                            "tokens_used": result.tokens_used,
                            "cost": float(result.cost) if result.cost is not None else None,
                        }
                        if error_details:
                            response_data["error"] = error_details

                        # Evaluate signals for this response (zero-config friendly)
                        signal_result = signal_service.detect_all_signals(
                            project_id=project_id,
                            response_text=response_text or "",
                            request_data=None,
                            response_data=response_data,
                            baseline_data=None,
                            snapshot_id=None,
                        )
                        # Attach provider error details if present so UI can surface them
                        if error_details:
                            signal_result.setdefault("details", {})
                            if isinstance(signal_result["details"], dict):
                                signal_result["details"]["llm_error"] = error_details

                        result.signal_result = signal_result

                        # When a TestResult transitions from non-worst to worst, persist flags and enqueue an Alert
                        became_worst = bool(signal_result.get("is_worst")) and not bool(
                            getattr(result, "is_worst", False)
                        )
                        if became_worst:
                            result.is_worst = True
                            result.worst_status = signal_result.get("worst_status") or "unreviewed"

                            try:
                                alert = Alert(
                                    project_id=project_id,
                                    alert_type="worst_case",
                                    severity="high",
                                    title="New worst case detected (Test Lab)",
                                    message=(
                                        f"Agent '{result.agent_id}' has a new worst Test Lab result "
                                        f"(status={result.worst_status or 'unreviewed'})."
                                    ),
                                    alert_data={
                                        "source": "test_lab_run",
                                        "target": "test_lab",
                                        "project_id": project_id,
                                        "agent_id": result.agent_id,
                                        "worst_status": result.worst_status,
                                        "test_result_id": result.id,
                                        "test_run_id": result.test_run_id,
                                    },
                                )
                                self.db.add(alert)
                            except Exception:
                                # Alerts should not break Test Lab execution; errors are logged globally
                                pass

                        status_value = signal_result.get("status")
                        if status_value == "safe":
                            pass_count += 1
                        else:
                            fail_count += 1

                        # Collect cases that require human review:
                        # - Explicit SignalEngine verdict: needs_review / critical
                        # - Or newly marked worst result
                        if status_value in ("needs_review", "critical") or became_worst:
                            review_items.append(
                                {
                                    "test_result_id": result.id,
                                    "prompt": result.input or "",
                                    "response_after": result.response or "",
                                    "signal_result": signal_result,
                                }
                            )

                        self.db.add(result)
                        results_created += 1
        except Exception:
            # Mark run as failed if execution unexpectedly errors
            run.status = "failed"
            self.db.add(run)
            self.db.commit()
            self.db.refresh(run)
            raise

        # Auto-create a Review when any results need human attention
        if review_items:
            try:
                review_service.create_review_from_signal(
                    project_id=project_id,
                    origin="test_lab",
                    title=f"Test Lab run '{run.name}' results requiring review",
                    description=(
                        f"{len(review_items)} Test Lab result(s) have signals that "
                        "require human review."
                    ),
                    items=review_items,
                    test_run_id=run.id,
                )
            except Exception:
                # Review creation should not break Test Lab execution; errors are logged globally
                pass

        # Update run counters and mark as completed
        run.total_count = results_created
        run.pass_count = pass_count
        run.fail_count = fail_count
        run.status = "completed"
        self.db.add(run)
        self.db.commit()
        self.db.refresh(run)

    # ------------------------------------------------------------------
    # Test run & results helpers (for endpoints + future runner)
    # ------------------------------------------------------------------
    def create_test_run(
        self,
        project_id: int,
        name: str,
        test_type: str,
        agent_config: Optional[Dict[str, Any]] = None,
        signal_config: Optional[Dict[str, Any]] = None,
    ) -> TestRun:
        run = TestRun(
            project_id=project_id,
            name=name,
            test_type=test_type,
            agent_config=agent_config,
            signal_config=signal_config,
            status="running",
        )
        self.db.add(run)
        self.db.commit()
        self.db.refresh(run)
        return run

    def get_test_run(self, project_id: int, run_id: str) -> Optional[TestRun]:
        return (
            self.db.query(TestRun)
            .filter(TestRun.project_id == project_id, TestRun.id == run_id)
            .first()
        )

    def list_results(
        self,
        project_id: int,
        *,
        agent_id: Optional[str] = None,
        run_id: Optional[str] = None,
        is_worst: Optional[bool] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Tuple[List[TestResult], int]:
        query = self.db.query(TestResult).filter(TestResult.project_id == project_id)

        if agent_id:
            query = query.filter(TestResult.agent_id == agent_id)
        if run_id:
            query = query.filter(TestResult.test_run_id == run_id)
        if is_worst is not None:
            query = query.filter(TestResult.is_worst == is_worst)

        # Test Lab specific sources (per design: test_lab / chain_test)
        query = query.filter(TestResult.source.in_(["test_lab", "chain_test"]))

        total = query.count()
        items = (
            query.order_by(TestResult.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        return items, total

    def mark_result_worst(
        self,
        project_id: int,
        result_id: str,
        worst_status: Optional[str] = "unreviewed",
    ) -> TestResult:
        result = (
            self.db.query(TestResult)
            .filter(TestResult.id == result_id, TestResult.project_id == project_id)
            .first()
        )
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Test result not found",
            )

        # Only create an alert when transitioning from non-worst to worst
        was_worst_before = bool(result.is_worst)

        result.is_worst = True
        result.worst_status = worst_status or "unreviewed"
        self.db.commit()
        self.db.refresh(result)

        if not was_worst_before:
            try:
                alert = Alert(
                    project_id=project_id,
                    alert_type="worst_case",
                    severity="high",
                    title="New worst case marked (Test Lab)",
                    message=(
                        f"Agent '{result.agent_id}' Test Lab result was marked as worst "
                        f"(status={result.worst_status or 'unreviewed'})."
                    ),
                    alert_data={
                        "source": "test_lab_manual",
                        "target": "test_lab",
                        "project_id": project_id,
                        "agent_id": result.agent_id,
                        "worst_status": result.worst_status,
                        "test_result_id": result.id,
                        "test_run_id": result.test_run_id,
                    },
                )
                self.db.add(alert)
                self.db.commit()
            except Exception:
                # Manual worst marking should not fail because of alerts
                pass

        return result

