import pytest
from pydantic import ValidationError


def execute(data, name, arguments=None):
    from app.review.schemas import AgentRequest
    from app.review.tools import execute_tool

    return execute_tool(AgentRequest.model_validate(data), name, arguments or {})


def test_source_window_preserves_numbered_evidence_and_cannot_escape(request_data):
    result = execute(request_data, "read_source_window", {"sourceId": "source-1", "startLine": 2, "endLine": 2})
    assert result["status"] == "ok"
    assert result["sources"][0]["code"] == "expect(shouldAutoReview({isDraft:true,reviewsPaused:false})).toBe(false);"
    assert result["sources"][0]["startLine"] == 2
    for args in [
        {"sourceId": "foreign", "startLine": 1, "endLine": 2},
        {"sourceId": "source-1", "startLine": 1, "endLine": 100},
        {"sourceId": "source-1", "startLine": 0, "endLine": 2},
        {"sourceId": "source-1", "startLine": 1, "endLine": 2, "repository": "other/private"},
    ]:
        assert execute(request_data, "read_source_window", args)["status"] == "denied"


def test_scoped_retrieval_returns_relevant_trusted_source(request_data):
    result = execute(request_data, "search_review_context", {"query": "isDraft reviewsPaused", "k": 1})
    assert result["sources"][0]["sourceId"] == "source-1"
    assert len(result["sources"]) == 1
    assert execute(request_data, "search_review_context", {"query": "nonexistentxyz", "k": 4})["status"] == "no_match"


def test_five_tools_use_current_request_and_never_claim_tests_ran(request_data):
    snapshot = execute(request_data, "inspect_pr_snapshot")
    assert snapshot["files"] == ["src/policy.js"]
    related = execute(request_data, "find_related_tests", {"filePath": "src/policy.js"})
    assert related["sources"][0]["filePath"] == "test/policy.test.js"
    assert related["executed"] is False
    rules = execute(request_data, "run_review_rules", {"filePath": "src/policy.js"})
    assert rules["signals"][0]["category"] == "test-gap"
    assert execute(request_data, "execute_shell", {"command": "anything"})["status"] == "denied"
    assert execute(request_data, "find_related_tests", {"filePath": "other/private.js"})["status"] == "denied"
    request_data["sources"] = []
    assert execute(request_data, "find_related_tests", {"filePath": "src/policy.js"})["status"] == "no_match"


@pytest.mark.parametrize("mutation", ["foreign_revision", "traversal", "secret_path", "duplicate_id", "extra_scope", "too_many_files"])
def test_request_rejects_invalid_source_scope(request_data, mutation):
    from app.review.schemas import AgentRequest

    if mutation == "foreign_revision":
        request_data["sources"][0]["revision"] = "3" * 40
    elif mutation == "traversal":
        request_data["sources"][0]["filePath"] = "../other.js"
    elif mutation == "secret_path":
        request_data["sources"][0]["filePath"] = ".env"
    elif mutation == "duplicate_id":
        request_data["sources"].append(request_data["sources"][0])
    elif mutation == "extra_scope":
        request_data["scope"]["token"] = "not-a-real-token"
    else:
        request_data["files"] *= 6
    with pytest.raises(ValidationError):
        AgentRequest.model_validate(request_data)


def test_old_side_requires_diff_base_revision(request_data):
    from app.review.schemas import AgentRequest

    request_data["scope"]["diffBaseSha"] = "3" * 40
    request_data["sources"][0].update(lineSide="old", revision="3" * 40)
    assert AgentRequest.model_validate(request_data).sources[0].lineSide == "old"
    request_data["sources"][0]["revision"] = "1" * 40
    with pytest.raises(ValidationError):
        AgentRequest.model_validate(request_data)
