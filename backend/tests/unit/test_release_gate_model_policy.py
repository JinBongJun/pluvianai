import pytest


@pytest.mark.unit
class TestReleaseGatePinnedModelPolicy:
    def test_is_pinned_anthropic_model_id(self):
        from app.api.v1.endpoints.release_gate import _is_pinned_anthropic_model_id

        assert _is_pinned_anthropic_model_id("claude-sonnet-4-20250514") is True
        assert _is_pinned_anthropic_model_id("claude-haiku-4-5-20251001") is True
        assert _is_pinned_anthropic_model_id("claude-opus-4-6") is False
        assert _is_pinned_anthropic_model_id("claude-3-5-sonnet-latest") is False
        assert _is_pinned_anthropic_model_id("") is False

    def test_should_block_custom_model_in_production(self, monkeypatch, test_user):
        from app.api.v1.endpoints import release_gate as rg

        monkeypatch.setattr(rg.app_settings, "ENVIRONMENT", "production", raising=False)
        monkeypatch.setattr(rg.app_settings, "RELEASE_GATE_ALLOW_CUSTOM_MODELS", False, raising=False)
        test_user.is_superuser = False

        assert rg._should_block_release_gate_custom_model("anthropic", "claude-opus-4-6", test_user) is True
        assert rg._should_block_release_gate_custom_model("anthropic", "claude-sonnet-4-20250514", test_user) is False

    def test_escape_hatch_superuser_allows_custom(self, monkeypatch, test_user):
        from app.api.v1.endpoints import release_gate as rg

        monkeypatch.setattr(rg.app_settings, "ENVIRONMENT", "production", raising=False)
        monkeypatch.setattr(rg.app_settings, "RELEASE_GATE_ALLOW_CUSTOM_MODELS", False, raising=False)
        test_user.is_superuser = True

        assert rg._should_block_release_gate_custom_model("anthropic", "claude-opus-4-6", test_user) is False

    def test_escape_hatch_flag_allows_custom(self, monkeypatch, test_user):
        from app.api.v1.endpoints import release_gate as rg

        monkeypatch.setattr(rg.app_settings, "ENVIRONMENT", "production", raising=False)
        monkeypatch.setattr(rg.app_settings, "RELEASE_GATE_ALLOW_CUSTOM_MODELS", True, raising=False)
        test_user.is_superuser = False

        assert rg._should_block_release_gate_custom_model("anthropic", "claude-opus-4-6", test_user) is False

    def test_non_production_does_not_block(self, monkeypatch, test_user):
        from app.api.v1.endpoints import release_gate as rg

        monkeypatch.setattr(rg.app_settings, "ENVIRONMENT", "development", raising=False)
        monkeypatch.setattr(rg.app_settings, "RELEASE_GATE_ALLOW_CUSTOM_MODELS", False, raising=False)
        test_user.is_superuser = False

        assert rg._should_block_release_gate_custom_model("anthropic", "claude-opus-4-6", test_user) is False


@pytest.mark.unit
class TestReleaseGateProviderModelMismatch:
    def test_assert_provider_matches_model_allows_matching(self):
        from app.api.v1.endpoints import release_gate as rg

        rg._assert_provider_matches_model("google", "gemini-2.5-flash")
        rg._assert_provider_matches_model("anthropic", "claude-sonnet-4-20250514")
        rg._assert_provider_matches_model("openai", "gpt-4.1-mini")

    def test_assert_provider_matches_model_raises_on_mismatch(self):
        from app.api.v1.endpoints import release_gate as rg
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as e:
            rg._assert_provider_matches_model("openai", "gemini-2.5-flash")
        assert e.value.status_code == 422
        assert isinstance(e.value.detail, dict)
        assert e.value.detail.get("error_code") == "provider_model_mismatch"

    def test_assert_provider_matches_model_skips_when_uninferable_or_missing(self):
        from app.api.v1.endpoints import release_gate as rg

        # Missing model -> no inference -> skip
        rg._assert_provider_matches_model("google", "")
        # Missing provider -> skip
        rg._assert_provider_matches_model("", "gemini-2.5-flash")


@pytest.mark.unit
class TestReleaseGateSignalsPayload:
    def test_configured_eval_check_ids_only_include_enabled_canonical_checks(self):
        from app.api.v1.endpoints import release_gate as rg

        ids = rg._configured_eval_check_ids(
            {
                "empty": {"enabled": True},
                "latency": {"enabled": True},
                "status_code": {"enabled": False},
                "refusal": {"enabled": False},
                "json": {"enabled": False},
                "length": {"enabled": False},
                "repetition": {"enabled": False},
                "required": {"enabled": False},
                "format": {"enabled": False},
                "leakage": {"enabled": False},
                "tool": {"enabled": True},
            }
        )

        assert ids == ["empty", "latency", "tool"]

    def test_configured_eval_check_ids_does_not_auto_enable_missing_keys(self):
        from app.api.v1.endpoints import release_gate as rg

        ids = rg._configured_eval_check_ids(
            {
                "empty": {"enabled": True},
                "latency": {"enabled": True},
                # intentionally missing json/refusal/length/repetition/status_code
                "required": {"enabled": False},
                "tool_use_policy": {"enabled": False},
            }
        )

        assert ids == ["empty", "latency"]

    def test_build_release_gate_signals_payload_splits_runtime_diagnostics(self):
        from app.api.v1.endpoints import release_gate as rg

        payload = rg._build_release_gate_signals_payload(
            signals_checks={
                "empty": "pass",
                "required": "fail",
                "tool_grounding": "fail",
                "required_keywords": "fail",
            },
            signals_details={
                "empty": {"status": "pass"},
                "required": {"status": "fail"},
                "tool_grounding": {"status": "fail", "reason": "missing evidence"},
            },
            eval_config_version="cfg-1",
            config_check_ids=["empty", "required"],
        )

        assert payload["checks"] == {"empty": "pass", "required": "fail"}
        assert payload["failed"] == ["required"]
        assert payload["config_check_ids"] == ["empty", "required"]
        assert payload["runtime_checks"] == {
            "tool_grounding": "fail",
            "required_keywords": "fail",
        }
        assert payload["runtime_details"]["tool_grounding"]["reason"] == "missing evidence"


@pytest.mark.unit
class TestReleaseGateOverrideSanitizer:
    def test_sanitize_replay_overrides_removes_disallowed_content_keys(self):
        from app.api.v1.endpoints import release_gate as rg

        raw = {
            "messages": [{"role": "user", "content": "hack"}],
            "response": "override response",
            "trace_id": "bad-trace",
            "agent_id": "agent-b",
            "temperature": 0.2,
            "tools": [{"type": "function", "function": {"name": "search"}}],
            "top_p": 0.8,
        }
        cleaned = rg._sanitize_replay_overrides(raw)
        assert isinstance(cleaned, dict)
        assert "messages" not in cleaned
        assert "response" not in cleaned
        assert "trace_id" not in cleaned
        assert "agent_id" not in cleaned
        assert cleaned.get("temperature") == 0.2
        assert cleaned.get("top_p") == 0.8
        assert "tools" in cleaned

    def test_sanitize_replay_overrides_returns_none_when_only_disallowed(self):
        from app.api.v1.endpoints import release_gate as rg

        raw = {
            "messages": [{"role": "user", "content": "x"}],
            "response": "x",
            "trace_id": "x",
            "agent_name": "x",
        }
        assert rg._sanitize_replay_overrides(raw) is None

    def test_sanitize_replay_overrides_keeps_non_message_body_keys(self):
        """Top-level attachments/documents etc. are allowed; conversation keys are stripped."""
        from app.api.v1.endpoints import release_gate as rg

        raw = {
            "attachments": [{"id": "a1"}],
            "documents": [{"text": "x"}],
            "messages": [{"role": "user", "content": "hack"}],
            "temperature": 0.1,
        }
        cleaned = rg._sanitize_replay_overrides(raw)
        assert isinstance(cleaned, dict)
        assert cleaned.get("attachments") == [{"id": "a1"}]
        assert cleaned.get("documents") == [{"text": "x"}]
        assert cleaned.get("temperature") == 0.1
        assert "messages" not in cleaned

    def test_build_replay_request_meta_baseline_vs_applied(self):
        from types import SimpleNamespace

        from app.api.v1.endpoints import release_gate as rg

        snap = SimpleNamespace()
        snap.payload = {
            "request": {
                "model": "gpt-4o",
                "attachments": [{"id": "from_snap"}],
                "temperature": 0.3,
            }
        }
        payload = SimpleNamespace(
            replay_overrides={"attachments": [{"id": "applied"}], "extra": 1},
            replay_temperature=0.7,
            replay_max_tokens=None,
            replay_top_p=None,
            new_system_prompt="sys",
        )
        meta = rg._build_replay_request_meta([snap], payload)
        assert meta["replay_overrides_applied"]["attachments"] == [{"id": "applied"}]
        assert meta["baseline_snapshot_excerpt"]["attachments"] == [{"id": "from_snap"}]
        assert meta["baseline_snapshot_excerpt"]["extra"] is None
        assert meta["sampling_overrides"]["replay_temperature"] == 0.7
        assert meta["has_new_system_prompt"] is True
        assert meta.get("replay_overrides_by_snapshot_id_applied") is None

    def test_sanitize_replay_overrides_by_snapshot_id_strips_bad_entries(self):
        from app.api.v1.endpoints import release_gate as rg

        raw = {
            "42": {"attachments": [{"id": "a"}], "messages": [{"role": "user", "content": "x"}]},
            "": {"x": 1},
            "99": "not-a-dict",
        }
        out = rg._sanitize_replay_overrides_by_snapshot_id(raw)
        assert out is not None
        assert set(out.keys()) == {"42"}
        assert "messages" not in out["42"]
        assert out["42"]["attachments"] == [{"id": "a"}]

    def test_normalize_and_infer_provider_helpers(self):
        from app.api.v1.endpoints import release_gate as rg

        assert rg._normalize_provider(" OpenAI ") == "openai"
        assert rg._normalize_provider("anthropic") == "anthropic"
        assert rg._normalize_provider("google") == "google"
        assert rg._normalize_provider("something-else") is None

        assert rg._infer_provider_from_model("claude-sonnet-4-20250514") == "anthropic"
        assert rg._infer_provider_from_model("gemini-2.5-flash") == "google"
        assert rg._infer_provider_from_model("gpt-4.1-mini") == "openai"


@pytest.mark.unit
class TestReleaseGateAttemptGate:
    def _make_user(self, user_id: int = 1, is_superuser: bool = False):
        class DummyUser:
            def __init__(self):
                self.id = user_id
                self.is_superuser = is_superuser

        return DummyUser()

    def test_calculate_release_gate_attempts_uses_snapshot_count_times_repeats(self):
        from app.api.v1.endpoints import release_gate as rg

        payload = rg.ReleaseGateValidateRequest(repeat_runs=10)
        assert rg._calculate_release_gate_attempts([object(), object()], payload) == 20

    def test_enforce_release_gate_attempt_limit_allows_when_quota_available(self, monkeypatch):
        from app.api.v1.endpoints import release_gate as rg

        payload = rg.ReleaseGateValidateRequest(repeat_runs=3)
        user = self._make_user()
        resolved = rg._ResolvedReleaseGateInputs(
            trace_id="trace-1",
            baseline_trace_id="trace-1",
            snapshots=[object(), object()],
        )

        monkeypatch.setattr(
            rg,
            "check_release_gate_attempts_limit",
            lambda db, uid, amount, is_superuser: (True, None),
            raising=True,
        )
        attempts = rg._enforce_release_gate_attempt_limit(
            payload,
            db=None,
            current_user=user,
            project_id=1,
            resolved_inputs=resolved,
        )
        assert attempts == 6

    def test_enforce_release_gate_attempt_limit_blocks_with_expected_error_code(self, monkeypatch):
        from app.api.v1.endpoints import release_gate as rg
        from fastapi import HTTPException

        payload = rg.ReleaseGateValidateRequest(repeat_runs=5)
        user = self._make_user()
        resolved = rg._ResolvedReleaseGateInputs(
            trace_id="trace-1",
            baseline_trace_id="trace-1",
            snapshots=[object(), object()],
        )

        monkeypatch.setattr(
            rg,
            "check_release_gate_attempts_limit",
            lambda db, uid, amount, is_superuser: (False, "Release Gate usage exhausted."),
            raising=True,
        )
        monkeypatch.setattr(
            rg,
            "get_limit_status",
            lambda db, uid, metric: {
                "plan_type": "free",
                "metric": metric,
                "current": 60,
                "limit": 60,
                "remaining": 0,
                "reset_at": "2026-04-01T00:00:00+00:00",
            },
            raising=True,
        )

        with pytest.raises(HTTPException) as e:
            rg._enforce_release_gate_attempt_limit(
                payload,
                db=None,
                current_user=user,
                project_id=1,
                resolved_inputs=resolved,
            )

        assert e.value.status_code == 403
        assert isinstance(e.value.detail, dict)
        assert e.value.detail.get("code") == "LIMIT_RELEASE_GATE_ATTEMPTS"


@pytest.mark.unit
class TestReleaseGateToolEvidenceSummary:
    def test_stage1_tool_execution_summary_counts_tool_results(self):
        from app.api.v1.endpoints.release_gate import _build_stage1_tool_execution_summary

        summary = _build_stage1_tool_execution_summary(
            [
                {"name": "web_search", "status": "simulated", "result_preview": "top result"},
                {"name": "fetch_doc", "status": "failed", "result_preview": ""},
            ]
        )

        assert summary["status"] == "calls_detected_no_execution"
        assert summary["counts"]["total_calls"] == 2
        assert summary["counts"]["simulated"] == 1
        assert summary["counts"]["failed"] == 1
        assert summary["counts"]["tool_results"] == 1

    def test_stage1_tool_execution_summary_defaults_to_zero_without_calls(self):
        from app.api.v1.endpoints.release_gate import _build_stage1_tool_execution_summary

        summary = _build_stage1_tool_execution_summary([])

        assert summary["status"] == "no_tool_calls"
        assert summary["counts"]["tool_results"] == 0


@pytest.mark.unit
class TestReleaseGateToolGrounding:
    def test_assess_tool_grounding_passes_on_token_overlap(self):
        from app.api.v1.endpoints.release_gate import _assess_tool_grounding

        result = _assess_tool_grounding(
            tool_evidence=[
                {
                    "name": "get_weather",
                    "status": "simulated",
                    "result_preview": '{"city":"Seoul","forecast":"sunny","temperature":"23C"}',
                }
            ],
            candidate_response_preview="The current weather in Seoul is sunny at 23C.",
            tool_loop_status="completed",
        )

        assert result["status"] == "pass"
        assert result["grounded_rows"] == 1
        assert "seoul" in result["matched_tokens"]

    def test_assess_tool_grounding_fails_when_response_ignores_tool_result(self):
        from app.api.v1.endpoints.release_gate import _assess_tool_grounding

        result = _assess_tool_grounding(
            tool_evidence=[
                {
                    "name": "get_weather",
                    "status": "simulated",
                    "result_preview": '{"city":"Seoul","forecast":"sunny","temperature":"23C"}',
                }
            ],
            candidate_response_preview="I cannot verify the current weather right now.",
            tool_loop_status="completed",
        )

        assert result["status"] == "fail"
        assert result["grounded_rows"] == 0
        assert result["coverage_ratio"] == 0.0

    def test_merge_tool_grounding_with_semantic_can_rescue_fail(self):
        from app.api.v1.endpoints.release_gate import _merge_tool_grounding_with_semantic

        merged = _merge_tool_grounding_with_semantic(
            {
                "status": "fail",
                "reason": "Lexical overlap was weak.",
                "tool_calls": 1,
                "tool_results": 1,
            },
            {
                "status": "pass",
                "reason": "The final response accurately paraphrases the tool evidence.",
                "judge_confidence": "high",
                "judge_model": "gpt-4o-mini",
                "matched_facts": ["Seoul weather is sunny"],
            },
        )

        assert merged["status"] == "pass"
        assert merged["semantic_status"] == "pass"
        assert "Semantic judge rescue" in merged["reason"]
        assert merged["matched_facts"] == ["Seoul weather is sunny"]

    def test_merge_tool_grounding_with_semantic_preserves_fail(self):
        from app.api.v1.endpoints.release_gate import _merge_tool_grounding_with_semantic

        merged = _merge_tool_grounding_with_semantic(
            {
                "status": "fail",
                "reason": "Lexical overlap was weak.",
                "tool_calls": 1,
                "tool_results": 1,
            },
            {
                "status": "fail",
                "reason": "The response introduces unsupported claims.",
                "judge_confidence": "medium",
                "judge_model": "gpt-4o-mini",
                "missing_facts": ["Observed weather"],
            },
        )

        assert merged["status"] == "fail"
        assert merged["semantic_status"] == "fail"
        assert merged["reason"] == "The response introduces unsupported claims."

