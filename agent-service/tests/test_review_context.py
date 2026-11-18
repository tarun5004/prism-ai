"""Capture the actual SDK wire request; provider transport never leaves the process."""
import json

import pytest


def capture_transport(monkeypatch, value, finish="STOP"):
    from google.genai._api_client import BaseApiClient, HttpResponse

    requests = []

    def send(client, request, *args, **kwargs):
        requests.append(request.data)
        return HttpResponse({}, [json.dumps({"candidates": [{"content": {"role": "model", "parts": [
            {"text": json.dumps(value)}]}, "finishReason": finish}],
            "usageMetadata": {"promptTokenCount": 7, "candidatesTokenCount": 4, "totalTokenCount": 11}})])

    monkeypatch.setattr(BaseApiClient, "_request_once", send)
    return requests


def content_from(wire):
    return json.loads(wire["contents"][0]["parts"][0]["text"])


def test_review_configures_reasoning_on_actual_sdk_wire_without_revealing_thoughts(monkeypatch, request_data):
    from app.config import Settings
    from app.review.llm_client import GeminiModel
    from app.review.schemas import AgentRequest
    from test_graph import output

    wire = capture_transport(monkeypatch, output())
    model = GeminiModel(Settings(api_key="offline-unit-key", model="gemini-3.1-flash-lite"))
    model.draft(AgentRequest.model_validate(request_data), [], [], timeout=1)
    assert wire[0]["generationConfig"]["thinkingConfig"]["thinking_level"] == "MEDIUM"
    assert wire[0]["generationConfig"]["thinkingConfig"]["include_thoughts"] is False
    # Provider maxOutputTokens is shared by hidden thinking and visible JSON.
    assert wire[0]["generationConfig"]["maxOutputTokens"] == 8192


def test_planner_keeps_lower_reasoning_and_review_setting_can_be_overridden(monkeypatch, request_data):
    from app.config import Settings
    from app.review.llm_client import GeminiModel
    from app.review.schemas import AgentRequest

    wire = capture_transport(monkeypatch, {"action": "finish", "calls": []})
    request = AgentRequest.model_validate(request_data)
    model = GeminiModel(Settings(api_key="offline-unit-key", model="gemini-3.1-flash-lite", thinking_level="medium"))
    model.decide(request, [], timeout=1)
    model.draft(request, [], [], timeout=1)
    assert [item["generationConfig"]["thinkingConfig"]["thinking_level"] for item in wire] == ["LOW", "MEDIUM"]
    assert wire[0]["generationConfig"]["maxOutputTokens"] == 2048


def test_selected_context_preserves_explicit_line_coordinates_on_wire(monkeypatch, request_data):
    from app.config import Settings
    from app.review.llm_client import GeminiModel
    from app.review.schemas import AgentRequest

    wire = capture_transport(monkeypatch, {"action": "finish", "calls": []})
    request_data["sources"][0]["startLine"] = 21
    request = AgentRequest.model_validate(request_data)
    source = request.sources[0].model_dump()
    model = GeminiModel(Settings(api_key="offline-unit-key", model="gemini-offline-fixture"))
    model.decide(request, [{"selectedContext": [source]}], timeout=1)
    model.draft(request, [source], [], timeout=1)
    decision = content_from(wire[0])
    review = content_from(wire[1])
    assert decision["availableSources"][0]["endLine"] == 22
    for selected in [decision["observations"][0]["selectedContext"][0], review["context"][0]]:
        assert selected["sourceId"] == "source-1"
        assert selected["lines"] == [
            {"lineNumber": 21, "code": "// Draft PRs must not run."},
            {"lineNumber": 22, "code": "expect(shouldAutoReview({isDraft:true,reviewsPaused:false})).toBe(false);"},
        ]
        assert "code" not in selected  # Avoid duplicate unnumbered source that suggests the wrong offset.


def test_invalid_reasoning_setting_fails_before_request(monkeypatch):
    from app.config import Settings

    monkeypatch.setenv("PRISM_AGENT_THINKING_LEVEL", "unbounded")
    with pytest.raises(ValueError):
        Settings.from_env()


def test_provider_default_opt_out_and_other_models_do_not_get_unsupported_level(monkeypatch, request_data):
    from app.config import Settings
    from app.review.llm_client import GeminiModel
    from app.review.schemas import AgentRequest

    wire = capture_transport(monkeypatch, {"action": "finish", "calls": []})
    for settings in [Settings(api_key="offline-unit-key", model="gemini-3.1-flash-lite", thinking_level="provider"),
                     Settings(api_key="offline-unit-key", model="gemini-2.5-flash")]:
        GeminiModel(settings).decide(AgentRequest.model_validate(request_data), [], timeout=1)
    assert all(not ({"thinkingLevel", "thinking_level"} & item["generationConfig"].get("thinkingConfig", {}).keys())
               for item in wire)


def test_sdk_resource_prefixed_model_keeps_requested_reasoning(monkeypatch, request_data):
    from app.config import Settings
    from app.review.llm_client import GeminiModel
    from app.review.schemas import AgentRequest
    from test_graph import output

    wire = capture_transport(monkeypatch, output())
    model = GeminiModel(Settings(api_key="offline-unit-key", model="models/gemini-3.1-flash-lite", thinking_level="high"))
    model.draft(AgentRequest.model_validate(request_data), [], [], timeout=1)
    assert wire[0]["generationConfig"]["thinkingConfig"]["thinking_level"] == "HIGH"
    assert model.review_thinking_level == "high"


def test_provider_truncation_reason_survives_sdk_conversion(monkeypatch, request_data):
    from app.config import Settings
    from app.review.llm_client import GeminiModel
    from app.review.schemas import AgentRequest

    capture_transport(monkeypatch, {"action": "finish", "calls": []}, finish="MAX_TOKENS")
    reply = GeminiModel(Settings(api_key="offline-unit-key", model="gemini-offline-fixture")).decide(
        AgentRequest.model_validate(request_data), [], timeout=1)
    assert reply.value is None
    assert reply.finish_reason == "MAX_TOKENS"


def test_review_schema_limits_walkthrough_to_changed_paths_not_retrieved_tests(monkeypatch, request_data):
    from app.config import Settings
    from app.review.llm_client import GeminiModel
    from app.review.schemas import AgentRequest
    from test_graph import output

    wire = capture_transport(monkeypatch, output())
    GeminiModel(Settings(api_key="offline-unit-key", model="gemini-offline-fixture")).draft(
        AgentRequest.model_validate(request_data), [], [], timeout=1)
    schema = wire[0]["generationConfig"]["responseJsonSchema"]
    assert schema["$defs"]["WalkthroughItem"]["properties"]["filePath"]["enum"] == ["src/policy.js"]
    # Context references remain allowed; only changed-file walkthrough membership is constrained.
    assert "enum" not in schema["$defs"]["Reference"]["properties"]["filePath"]
