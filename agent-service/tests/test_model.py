from types import SimpleNamespace
import pytest


def test_adapter_uses_explicit_private_configuration_and_extracts_only_usage(monkeypatch, request_data):
    from app.config import Settings
    from app.review.llm_client import GeminiModel
    from app.review.schemas import AgentRequest

    captured = []

    class FakeChat:
        def __init__(self, **kwargs):
            captured.append(kwargs)
            self.client = SimpleNamespace(models=SimpleNamespace(generate_content=lambda: SimpleNamespace(
                usage_metadata=SimpleNamespace(prompt_token_count=9, candidates_token_count=4, total_token_count=13))), close=lambda: None)

        def with_structured_output(self, schema, **kwargs):
            assert kwargs["method"] == "json_schema"
            return self

        def invoke(self, messages, **kwargs):
            self.client.models.generate_content()
            return {"parsed": {"action": "finish", "calls": []}, "parsing_error": None,
                    "raw": SimpleNamespace(usage_metadata={"input_tokens": 9, "output_tokens": 4, "total_tokens": 13},
                                           response_metadata={"finish_reason": "STOP"}, content="private transcript")}

    monkeypatch.setattr("langchain_google_genai.ChatGoogleGenerativeAI", FakeChat)
    model = GeminiModel(Settings(api_key="unit-test-not-a-real-key", model="explicit-model"))
    reply = model.decide(AgentRequest.model_validate(request_data), [], timeout=12)
    assert captured[0]["vertexai"] is False
    assert captured[0]["max_retries"] == 0
    assert captured[0]["timeout"] == 12
    assert reply.value == {"action": "finish", "calls": []}
    assert reply.usage["totalTokens"] == 13
    assert not hasattr(reply, "raw")


@pytest.mark.parametrize("status", [429, 503])
def test_real_sdk_issues_one_transport_request_and_classifies_rejections(monkeypatch, request_data, status, caplog):
    import json
    from google.genai import errors
    from google.genai._api_client import BaseApiClient
    from app.config import Settings
    from app.review.llm_client import GeminiModel, ModelRejected, ModelUncertain
    from app.review.schemas import AgentRequest

    calls = []

    def send(client, request, *args, **kwargs):
        calls.append("blocked-provider-transport")
        error = errors.ClientError if status < 500 else errors.ServerError
        raise error(status, {"error": {"code": status, "message": "private provider detail",
            "status": "RESOURCE_EXHAUSTED" if status == 429 else "UNAVAILABLE"}})

    monkeypatch.setattr(BaseApiClient, "_request_once", send)
    model = GeminiModel(Settings(api_key="offline-unit-key", model="gemini-offline-fixture"))
    with pytest.raises(ModelRejected if status == 429 else ModelUncertain) as caught:
        model.decide(AgentRequest.model_validate(request_data), [], timeout=1)
    assert len(calls) == 1
    assert "private provider detail" not in str(caught.value)
    failures = [json.loads(record.message) for record in caplog.records
                if record.name == "prism.agent" and '"event": "agent_provider_error"' in record.message]
    assert len(failures) == 1
    assert failures[0]["stage"] == "decide"
    assert failures[0]["httpStatus"] == status
    assert failures[0]["errorType"] in {"ClientError", "ServerError", "GoogleAPIError"}
    assert "private provider detail" not in caplog.text


def test_actual_sdk_missing_provider_usage_stays_null_before_langchain_zero_fill(monkeypatch, request_data):
    import json
    from google.genai._api_client import BaseApiClient, HttpResponse
    from app.config import Settings
    from app.review.llm_client import GeminiModel
    from app.review.schemas import AgentRequest

    payload = {"candidates": [{"content": {"role": "model", "parts": [{"text": '{"action":"finish","calls":[]}'}]}, "finishReason": "STOP"}],
               "usageMetadata": {"candidatesTokenCount": 5, "totalTokenCount": 5}}

    def send(*args, **kwargs):
        return HttpResponse({}, [json.dumps(payload)])

    monkeypatch.setattr(BaseApiClient, "_request_once", send)
    reply = GeminiModel(Settings(api_key="offline-unit-key", model="gemini-offline-fixture")).decide(
        AgentRequest.model_validate(request_data), [], timeout=1)
    assert reply.value == {"action": "finish", "calls": []}
    assert reply.usage["inputTokens"] is None
    assert reply.usage["thinkingTokens"] is None
    assert reply.usage["outputTokens"] == 5
