import pytest

from app.services.data_normalizer import DataNormalizer


@pytest.mark.unit
class TestDataNormalizerResponseExtraction:
    def test_openai_chat_content_is_extracted(self) -> None:
        normalizer = DataNormalizer()
        body = {
            "choices": [
                {
                    "message": {
                        "content": "hello from openai",
                    }
                }
            ]
        }

        result = normalizer._extract_response_text_with_meta(body)

        assert result["text"] == "hello from openai"
        assert result["path"] == "choices[0].message.content"
        assert result["reason"] is None

    def test_anthropic_text_blocks_are_joined(self) -> None:
        normalizer = DataNormalizer()
        body = {
            "content": [
                {"type": "text", "text": "hello"},
                {"type": "text", "text": "from claude"},
            ]
        }

        result = normalizer._extract_response_text_with_meta(body)

        assert result["text"] == "hello\nfrom claude"
        assert result["path"] == "content"
        assert result["reason"] is None

    def test_anthropic_nested_tool_result_text_is_extracted(self) -> None:
        normalizer = DataNormalizer()
        body = {
            "content": [
                {
                    "type": "tool_result",
                    "content": [
                        {"type": "text", "text": "nested anthropic result"},
                    ],
                }
            ]
        }

        result = normalizer._extract_response_text_with_meta(body)

        assert result["text"] == "nested anthropic result"
        assert result["path"] == "content"
        assert result["reason"] is None

    def test_google_parts_text_is_extracted(self) -> None:
        normalizer = DataNormalizer()
        body = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {"text": "hello from gemini"},
                        ]
                    }
                }
            ]
        }

        result = normalizer._extract_response_text_with_meta(body)

        assert result["text"] == "hello from gemini"
        assert result["path"] == "candidates[0].content.parts"
        assert result["reason"] is None

    def test_google_nested_response_text_is_extracted(self) -> None:
        normalizer = DataNormalizer()
        body = {
            "candidates": [
                {
                    "response": {
                        "content": {
                            "parts": [
                                {"text": "nested gemini response"},
                            ]
                        }
                    }
                }
            ]
        }

        result = normalizer._extract_response_text_with_meta(body)

        assert result["text"] == "nested gemini response"
        assert result["path"] == "candidates[0].response.content.parts"
        assert result["reason"] is None

    def test_serialized_json_fallback_recovers_text(self) -> None:
        normalizer = DataNormalizer()
        body = {
            "choices": "not-a-real-choices-list",
            "raw_dump": '{"message":{"content":"recovered from serialized json"}}',
        }

        result = normalizer._extract_response_text_with_meta(body)

        assert result["text"] == "recovered from serialized json"
        assert result["path"] == "__serialized_json_scan__"
        assert result["reason"] == "serialized_json_fallback"

    def test_tool_calls_only_returns_non_empty_text(self) -> None:
        normalizer = DataNormalizer()
        body = {
            "choices": [
                {
                    "message": {
                        "content": None,
                        "tool_calls": [{"id": "tc-1", "function": {"name": "search"}}],
                    }
                }
            ]
        }

        result = normalizer._extract_response_text_with_meta(body)

        assert result["text"] == "[tool-call-only response: no assistant text]"
        assert result["path"] == "choices[0].message.tool_calls"
        assert result["reason"] == "tool_calls_only"

    def test_does_not_extract_request_echo_from_generic_content_field(self) -> None:
        normalizer = DataNormalizer()
        body = {
            "raw_dump": '{"request":{"content":"system prompt echo only"}}',
        }

        result = normalizer._extract_response_text_with_meta(body)

        assert result["text"].startswith("[non-text response received]")
        assert result["reason"] == "no_text_found_in_known_fields"

    def test_does_not_treat_anthropic_tool_use_input_as_response_text(self) -> None:
        normalizer = DataNormalizer()
        body = {
            "content": [
                {
                    "type": "tool_use",
                    "name": "search_docs",
                    "input": {"query": "billing policy"},
                }
            ]
        }

        result = normalizer._extract_response_text_with_meta(body)

        assert result["text"] == "[non-text response received]\n\n{\n  \"content\": [\n    {\n      \"type\": \"tool_use\",\n      \"name\": \"search_docs\",\n      \"input\": {\n        \"query\": \"billing policy\"\n      }\n    }\n  ]\n}"
        assert result["reason"] == "no_text_found_in_known_fields"

    def test_does_not_treat_google_function_call_args_as_response_text(self) -> None:
        normalizer = DataNormalizer()
        body = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {"functionCall": {"name": "lookup", "args": {"ticket_id": "abc-123"}}}
                        ]
                    }
                }
            ]
        }

        result = normalizer._extract_response_text_with_meta(body)

        assert result["text"].startswith("[non-text response received]")
        assert result["reason"] == "no_text_found_in_known_fields"
