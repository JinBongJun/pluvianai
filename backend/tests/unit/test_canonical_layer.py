import json

import pytest

from app.core import canonical
from app.utils import tool_calls
from app.api.v1.endpoints import behavior as behavior_endpoint


@pytest.mark.unit
class TestParseToolArgs:
    def test_dict_input_returns_same_dict(self) -> None:
        raw = {"a": 1}
        result = tool_calls.parse_tool_args(raw)
        assert result == {"a": 1}

    def test_valid_json_string_parses_to_dict(self) -> None:
        raw = '{"x": 2}'
        result = tool_calls.parse_tool_args(raw)
        assert result == {"x": 2}

    def test_invalid_json_string_marks_invalid_with_raw(self) -> None:
        raw = "not json"
        result = tool_calls.parse_tool_args(raw)
        assert result.get("_invalid") is True
        assert result.get("_raw") == raw

    def test_json_non_dict_marks_invalid_with_raw(self) -> None:
        raw = "[1,2]"
        result = tool_calls.parse_tool_args(raw)
        assert result.get("_invalid") is True
        assert result.get("_raw") == raw

    def test_none_or_number_returns_empty_dict(self) -> None:
        assert tool_calls.parse_tool_args(None) == {}
        assert tool_calls.parse_tool_args(123) == {}

    def test_too_large_string_marks_too_large(self) -> None:
        raw = "x" * (tool_calls._MAX_TOOL_ARGS_BYTES + 1)  # type: ignore[attr-defined]
        result = tool_calls.parse_tool_args(raw)
        assert result.get("_invalid") is True
        assert result.get("_too_large") is True
        # _raw should be present but truncated
        assert isinstance(result.get("_raw"), str)
        assert len(result["_raw"]) <= 1024

    def test_too_large_dict_marks_too_large(self) -> None:
        # Build a dict that serializes over the size limit.
        big_value = "y" * (tool_calls._MAX_TOOL_ARGS_BYTES + 1)  # type: ignore[attr-defined]
        raw = {"k": big_value}
        result = tool_calls.parse_tool_args(raw)
        assert result.get("_invalid") is True
        assert result.get("_too_large") is True


@pytest.mark.unit
class TestDetectProvider:
    def test_hint_overrides_shape(self) -> None:
        body = {
            "choices": [
                {
                    "message": {
                        "content": "hello",
                    }
                }
            ]
        }
        # Even though shape looks OpenAI, hint should win.
        assert canonical._detect_provider(body, provider_hint="anthropic") == "anthropic"

    def test_openai_shape_without_hint(self) -> None:
        body = {"choices": [{"message": {"content": "hi"}}]}
        assert canonical._detect_provider(body, provider_hint=None) == "openai"

    def test_google_shape_without_hint(self) -> None:
        body = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {"text": "hi"},
                        ]
                    }
                }
            ]
        }
        assert canonical._detect_provider(body, provider_hint=None) == "google"

    def test_anthropic_shape_without_hint(self) -> None:
        body = {
            "content": [
                {
                    "type": "tool_use",
                    "name": "search",
                }
            ]
        }
        assert canonical._detect_provider(body, provider_hint=None) == "anthropic"

    def test_unknown_shape_returns_unknown(self) -> None:
        assert canonical._detect_provider({"foo": "bar"}, provider_hint=None) == "unknown"
        assert canonical._detect_provider("not a dict", provider_hint=None) == "unknown"


@pytest.mark.unit
class TestResponseToCanonicalToolCalls:
    def test_unknown_provider_returns_empty_list(self) -> None:
        calls, provider, id_conflict = canonical.response_to_canonical_tool_calls({"foo": "bar"})
        assert calls == []
        assert provider == "unknown"
        assert id_conflict is False

    def test_openai_dedup_and_conflict_detection(self) -> None:
        # Two tool_calls with same id and identical name/args -> dedup
        body_ok = {
            "choices": [
                {
                    "message": {
                        "tool_calls": [
                            {
                                "id": "tc1",
                                "function": {
                                    "name": "search",
                                    "arguments": json.dumps({"q": "hello"}),
                                },
                            },
                            {
                                "id": "tc1",
                                "function": {
                                    "name": "search",
                                    "arguments": json.dumps({"q": "hello"}),
                                },
                            },
                        ]
                    }
                }
            ]
        }
        calls, provider, id_conflict = canonical.response_to_canonical_tool_calls(body_ok)
        assert provider == "openai"
        assert id_conflict is False
        # dedup by id should leave only one
        assert len(calls) == 1
        assert calls[0]["name"] == tool_calls.normalize_tool_name("search")

        # Two tool_calls with same id but different payload -> id_conflict
        body_conflict = {
            "choices": [
                {
                    "message": {
                        "tool_calls": [
                            {
                                "id": "tc2",
                                "function": {
                                    "name": "search",
                                    "arguments": json.dumps({"q": "hello"}),
                                },
                            },
                            {
                                "id": "tc2",
                                "function": {
                                    "name": "search",
                                    "arguments": json.dumps({"q": "bye"}),
                                },
                            },
                        ]
                    }
                }
            ]
        }
        calls2, provider2, id_conflict2 = canonical.response_to_canonical_tool_calls(body_conflict)
        assert provider2 == "openai"
        assert id_conflict2 is True
        # When conflict, canonical layer should drop all tool_calls for safety.
        assert calls2 == []


@pytest.mark.unit
class TestResponseToCanonicalSteps:
    def test_always_includes_llm_call_even_without_tool_calls(self) -> None:
        steps = canonical.response_to_canonical_steps(
            {"foo": "bar"},
            provider_hint=None,
            step_order_base=1.0,
            base_meta={"source_type": "test"},
        )
        # At least one llm_call step
        assert len(steps) == 1
        s0 = steps[0]
        assert s0["step_type"] == "llm_call"
        assert s0["tool_name"] is None
        assert s0["tool_args"] == {}
        assert s0["source_type"] == "test"
        # Unknown provider should be marked
        assert s0.get("_provider_unknown") is True

    def test_id_conflict_sets_meta_flag(self) -> None:
        # Reuse conflicting OpenAI body from previous test
        body_conflict = {
            "choices": [
                {
                    "message": {
                        "tool_calls": [
                            {
                                "id": "tc2",
                                "function": {
                                    "name": "search",
                                    "arguments": json.dumps({"q": "hello"}),
                                },
                            },
                            {
                                "id": "tc2",
                                "function": {
                                    "name": "search",
                                    "arguments": json.dumps({"q": "bye"}),
                                },
                            },
                        ]
                    }
                }
            ]
        }
        steps = canonical.response_to_canonical_steps(body_conflict, provider_hint=None)
        # Conflict should still keep a single llm_call step but mark _id_conflict.
        assert len(steps) == 1
        s0 = steps[0]
        assert s0["step_type"] == "llm_call"
        assert s0.get("_id_conflict") is True


@pytest.mark.unit
class TestCanonicalSummaryAndProviderShapes:
    def test_summary_supports_proxy_wrapped_openai_response(self) -> None:
        payload = {
            "request": {"model": "gpt-4.1-mini"},
            "response": {
                "choices": [
                    {
                        "message": {
                            "tool_calls": [
                                {
                                    "id": "tc-1",
                                    "function": {"name": "search", "arguments": '{"q":"policy"}'},
                                }
                            ]
                        }
                    }
                ]
            },
        }
        summary = canonical.response_to_canonical_tool_calls_summary(payload)
        assert len(summary) == 1
        assert summary[0]["name"] == "search"
        assert summary[0]["arguments"] == {"q": "policy"}

    def test_google_multi_candidate_function_calls_are_collected(self) -> None:
        payload = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {"functionCall": {"id": "g-1", "name": "lookup", "args": {"id": 1}}},
                            {"text": "non-tool"},
                        ]
                    }
                },
                {
                    "content": {
                        "parts": [
                            {"functionCall": {"id": "g-2", "name": "search", "args": {"q": "x"}}}
                        ]
                    }
                },
            ]
        }
        calls, provider, conflict = canonical.response_to_canonical_tool_calls(payload)
        assert provider == "google"
        assert conflict is False
        assert [c["name"] for c in calls] == ["lookup", "search"]

    def test_anthropic_tool_use_preserves_args_dict(self) -> None:
        payload = {
            "content": [
                {"type": "text", "text": "thinking"},
                {"type": "tool_use", "id": "a-1", "name": "get_weather", "input": {"city": "seoul"}},
            ]
        }
        calls, provider, conflict = canonical.response_to_canonical_tool_calls(payload)
        assert provider == "anthropic"
        assert conflict is False
        assert len(calls) == 1
        assert calls[0]["name"] == "get_weather"
        assert calls[0]["arguments"] == {"city": "seoul"}


@pytest.mark.unit
class TestValidateToolArgsSchema:
    def _make_rule(self, rule_id: int = 1, name: str = "schema-rule"):
        class DummyRule:
            def __init__(self, _id: int, _name: str) -> None:
                self.id = _id
                self.name = _name
                self.severity_default = "high"

        return DummyRule(rule_id, name)

    def test_invalid_flag_uses_raw_and_skips_schema_checks(self) -> None:
        rule = self._make_rule()
        spec = {
            "tool": "search",
            "json_schema": {
                "required": ["q"],
                "additionalProperties": False,
                "properties": {"q": {"type": "string"}},
            },
        }
        steps = [
            {
                "step_order": 1.01,
                "step_type": "tool_call",
                "tool_name": "search",
                "tool_args": {
                    "_invalid": True,
                    "_raw": "not json",
                    "q": "should be ignored",
                },
            }
        ]

        violations = behavior_endpoint._validate_tool_args_schema(rule, spec, steps)
        assert len(violations) == 1
        v = violations[0]
        assert "could not be parsed" in v["message"]
        assert v["evidence"]["raw"] == "not json"
        # Required/extras 검사는 수행되지 않으므로 missing/extra 관련 메시지는 나오지 않는다.

    def test_reserved_keys_not_treated_as_extras(self) -> None:
        rule = self._make_rule()
        spec = {
            "tool": "search",
            "json_schema": {
                "required": [],
                "additionalProperties": False,
                "properties": {"q": {"type": "string"}},
            },
        }
        steps = [
            {
                "step_order": 1.01,
                "step_type": "tool_call",
                "tool_name": "search",
                "tool_args": {
                    "q": "ok",
                    "_raw": '{"q": "ok"}',
                    "_invalid": False,
                    "_too_large": False,
                },
            }
        ]

        violations = behavior_endpoint._validate_tool_args_schema(rule, spec, steps)
        # _raw / _invalid / _too_large 는 extras 로 카운트되면 안 된다.
        assert violations == []

    def test_missing_and_extra_fields_reported(self) -> None:
        rule = self._make_rule()
        spec = {
            "tool": "search",
            "json_schema": {
                "required": ["q"],
                "additionalProperties": False,
                "properties": {"q": {"type": "string"}},
            },
        }
        steps = [
            {
                "step_order": 1.01,
                "step_type": "tool_call",
                "tool_name": "search",
                "tool_args": {
                    # required "q" is missing
                    "extra": 1,
                },
            }
        ]

        violations = behavior_endpoint._validate_tool_args_schema(rule, spec, steps)
        assert len(violations) == 1
        v = violations[0]
        assert "Tool args schema validation failed" in v["message"]
        assert v["evidence"]["missing_fields"] == ["q"]
        assert v["evidence"]["extra_fields"] == ["extra"]


@pytest.mark.unit
class TestRunBehaviorValidation:
    def _make_rule(
        self,
        *,
        rule_id: int,
        name: str,
        rule_type: str,
        spec: dict,
        enabled: bool = True,
        scope_type: str = "project",
        scope_ref=None,
    ):
        class DummyRule:
            def __init__(self) -> None:
                self.id = rule_id
                self.name = name
                self.enabled = enabled
                self.scope_type = scope_type
                self.scope_ref = scope_ref
                self.rule_json = {"type": rule_type, "spec": spec}
                self.severity_default = "high"

        return DummyRule()

    def test_unknown_provider_creates_critical_violation(self) -> None:
        rules = []
        steps = [
            {
                "step_order": 1.0,
                "step_type": "llm_call",
                "tool_name": None,
                "tool_args": {},
                "_provider_unknown": True,
            }
        ]
        status, summary, violations = behavior_endpoint._run_behavior_validation(rules, steps)
        assert status == "fail"
        assert summary["violation_count"] == 1
        assert any("Unknown provider response" in v.get("message", "") for v in violations)

    def test_id_conflict_creates_critical_violation(self) -> None:
        rules = []
        steps = [
            {
                "step_order": 1.0,
                "step_type": "llm_call",
                "tool_name": None,
                "tool_args": {},
                "_id_conflict": True,
            }
        ]
        status, summary, violations = behavior_endpoint._run_behavior_validation(rules, steps)
        assert status == "fail"
        assert summary["violation_count"] == 1
        assert any("Duplicate tool_call id" in v.get("message", "") for v in violations)

    def test_empty_tool_name_creates_critical_violation(self) -> None:
        rules = []
        steps = [
            {
                "step_order": 1.0,
                "step_type": "tool_call",
                "tool_name": "",
                "tool_args": {},
            }
        ]
        status, summary, violations = behavior_endpoint._run_behavior_validation(rules, steps)
        assert status == "fail"
        assert summary["violation_count"] == 1
        assert any("Tool name empty or invalid" in v.get("message", "") for v in violations)

    def test_tool_forbidden_fails_when_tool_seen(self) -> None:
        rules = [
            self._make_rule(
                rule_id=10,
                name="forbid-search",
                rule_type="tool_forbidden",
                spec={"tools": ["search"]},
            )
        ]
        steps = [
            {
                "step_order": 1.01,
                "step_type": "tool_call",
                "tool_name": "search",
                "tool_args": {"q": "test"},
            }
        ]
        status, summary, violations = behavior_endpoint._run_behavior_validation(rules, steps)
        assert status == "fail"
        assert summary["violation_count"] >= 1
        assert any("Forbidden tool used" in v.get("message", "") for v in violations)

    def test_tool_allowlist_fails_when_tool_not_allowed(self) -> None:
        rules = [
            self._make_rule(
                rule_id=11,
                name="allow-only-lookup",
                rule_type="tool_allowlist",
                spec={"tools": ["lookup"]},
            )
        ]
        steps = [
            {
                "step_order": 1.01,
                "step_type": "tool_call",
                "tool_name": "search",
                "tool_args": {"q": "test"},
            }
        ]
        status, summary, violations = behavior_endpoint._run_behavior_validation(rules, steps)
        assert status == "fail"
        assert summary["violation_count"] >= 1
        assert any("Tool not in allowlist" in v.get("message", "") for v in violations)

