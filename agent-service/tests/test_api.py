import json

from fastapi.testclient import TestClient


def client():
    from app.config import Settings
    from app.main import create_app

    return TestClient(create_app(Settings(service_token="local-unit-test-service-token-only")))


def headers():
    return {"Authorization": "Bearer local-unit-test-service-token-only"}


def test_review_is_private_and_health_does_not_call_model(request_data):
    with client() as api:
        assert api.get("/health").json()["status"] == "ok"
        assert api.post("/v1/reviews", json=request_data).status_code == 401
        assert api.post("/v1/reviews", headers={"Authorization": "Bearer wrong"}, json=request_data).status_code == 401
        response = api.post("/v1/reviews", headers=headers(), json=request_data)
        assert response.status_code == 503
        assert response.json() == {"errorCode": "MODEL_UNAVAILABLE"}


def test_body_size_and_validation_do_not_echo_private_input(request_data):
    with client() as api:
        request_data["scope"]["repository"] = "../private-sensitive-value"
        response = api.post("/v1/reviews", headers=headers(), json=request_data)
        assert response.status_code == 422
        assert "private-sensitive-value" not in response.text
        body = json.dumps({"private": "x" * (256 * 1024)})
        assert api.post("/v1/reviews", headers=headers(), content=body).status_code == 413
        assert api.post("/v1/reviews", headers={**headers(), "Content-Encoding": "gzip"}, content=b"bad").status_code == 415


def test_actual_api_runs_graph_and_reports_uncertain_without_replay(request_data, caplog):
    from app.config import Settings
    from app.main import create_app
    from app.review.llm_client import ModelUncertain
    from test_graph import ScriptedModel

    for decision, status in [({"action": "finish", "calls": []}, 200), (ModelUncertain(), 504)]:
        model = ScriptedModel([decision])
        with TestClient(create_app(Settings(service_token="local-unit-test-service-token-only", model="scripted"), model)) as api:
            caplog.set_level("INFO", logger="prism.agent")
            response = api.post("/v1/reviews", headers=headers(), json=request_data)
            assert response.status_code == status
            if status == 200:
                assert response.json()["diagnostics"]["provenance"] == "scripted-fixture"
                assert response.json()["diagnostics"]["promptVersion"] == "bounded-review-v3"
                assert response.json()["diagnostics"]["thinkingLevel"] == "provider"
            else:
                assert response.json() == {"errorCode": "MODEL_REQUEST_UNCERTAIN"}
                assert model.requests == ["decide"]
    assert "agent_review" in caplog.text
    assert "return !isDraft" not in caplog.text
    assert "local-unit-test-service-token-only" not in caplog.text
