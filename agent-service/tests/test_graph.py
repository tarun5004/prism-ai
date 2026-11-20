import copy
import json

import pytest


def output():
    ref = {"filePath": "src/policy.js", "lineSide": "new", "lineNumber": 7,
           "evidence": "return !isDraft || !reviewsPaused;"}
    return {
        "findings": [{**ref, "title": "Eligibility uses OR instead of AND", "severity": "high",
                      "explanation": "A draft can run when reviews are not paused.",
                      "suggestedFix": "Use !isDraft && !reviewsPaused."}],
        "review": {"summary": "The eligibility condition can admit draft PRs.",
                   "walkthrough": [{"filePath": "src/policy.js", "description": "Eligibility changed.",
                                    "evidenceRefs": [ref]}],
                   "impacts": [], "limitations": []},
    }


class ScriptedModel:
    """Only provider I/O is substituted. Actual graph, tools and validators execute."""
    provenance = "scripted-fixture"
    def __init__(self, decisions, final=None):
        self.decisions = list(decisions)
        self.final = final if final is not None else output()
        self.requests = []
        self.selected = []

    def decide(self, request, observations, *, timeout):
        from app.review.llm_client import ModelReply

        self.requests.append("decide")
        value = self.decisions.pop(0)
        if isinstance(value, Exception):
            raise value
        return ModelReply(value, {"inputTokens": 10, "outputTokens": 5, "thinkingTokens": 0, "totalTokens": 15})

    def draft(self, request, selected, observations, *, timeout):
        from app.review.llm_client import ModelReply

        self.requests.append("draft")
        self.selected = selected
        return ModelReply(self.final, {"inputTokens": 10, "outputTokens": 5, "thinkingTokens": 0, "totalTokens": 15})


def run(request_data, model, **kwargs):
    from app.config import Settings
    from app.review.workflow import run_review
    from app.review.schemas import AgentRequest

    return run_review(AgentRequest.model_validate(request_data), model, Settings(model="scripted"), **kwargs)


def call(name, **arguments):
    return {"action": "tools", "calls": [{"name": name, "arguments": arguments}]}


def test_agent_chooses_real_evidence_tool_then_finishes(request_data, caplog):
    caplog.set_level("INFO", logger="prism.agent")
    model = ScriptedModel([call("find_related_tests", filePath="src/policy.js"), {"action": "finish", "calls": []}])
    result = run(request_data, model)
    assert result["status"] == "completed"
    assert result["findings"][0]["lineNumber"] == 7
    assert model.selected[0]["filePath"] == "test/policy.test.js"
    assert model.requests == ["decide", "decide", "draft"]
    assert result["diagnostics"]["events"][0]["tool"] == "find_related_tests"
    assert result["diagnostics"]["usage"]["totalTokens"] == 45
    assert "expect(" not in json.dumps(result["diagnostics"])
    assert result["diagnostics"]["provenance"] == "scripted-fixture"
    attempts = [json.loads(record.message) for record in caplog.records
                if record.name == "prism.agent" and '"event": "agent_attempt"' in record.message]
    assert [entry["stage"] for entry in attempts] == ["decide", "decide", "draft"]
    assert all(entry["reviewId"] == request_data["reviewId"] and entry["status"] == "completed"
               and type(entry["durationMs"]) is int for entry in attempts)
    assert "return !isDraft" not in caplog.text
    assert "expect(" not in caplog.text


def test_four_distinct_tools_share_two_rounds_then_final_is_reserved(request_data):
    model = ScriptedModel([
        {"action": "tools", "calls": [call("inspect_pr_snapshot")["calls"][0],
            call("find_related_tests", filePath="src/policy.js")["calls"][0]]},
        {"action": "tools", "calls": [call("run_review_rules")["calls"][0],
            call("search_review_context", query="help", k=1)["calls"][0]]},
    ])
    result = run(request_data, model)
    assert result["diagnostics"]["toolCalls"] == 4
    assert result["diagnostics"]["rounds"] == 2
    assert model.requests == ["decide", "decide", "draft"]
    assert result["diagnostics"]["stopReason"] == "round_budget"


def test_two_rounds_reserve_final_request_and_stop_repeated_tool(request_data):
    decision = call("search_review_context", query="isDraft", k=1)
    model = ScriptedModel([decision, decision, decision])
    result = run(request_data, model)
    assert len(model.requests) == 3
    assert model.requests[-1] == "draft"
    assert result["diagnostics"]["stopReason"] == "repeated_tool"
    assert result["diagnostics"]["toolCalls"] == 1
    assert result["status"] == "partial"


def test_malicious_decision_does_not_execute_or_repair_with_more_model_calls(request_data):
    model = ScriptedModel([call("execute_shell", command="private-sensitive-value")])
    result = run(request_data, model)
    assert model.requests == ["decide"]
    assert result["status"] == "unavailable"
    assert result["diagnostics"]["stopReason"] == "invalid_decision"
    assert "private-sensitive-value" not in json.dumps(result)


def test_rejected_429_retry_shares_request_budget_and_preserves_missing_usage(request_data):
    from app.review.llm_client import ModelRejected

    model = ScriptedModel([ModelRejected(429, retry_after=0), call("find_related_tests", filePath="src/policy.js")])
    result = run(request_data, model)
    assert model.requests == ["decide", "decide", "draft"]
    assert result["diagnostics"]["attempts"] == 3
    assert result["diagnostics"]["usage"]["totalTokens"] is None
    assert result["diagnostics"]["usage"]["knownTotalTokens"] == 30


def test_uncertain_model_call_is_never_replayed(request_data):
    from app.review.llm_client import ModelUncertain

    model = ScriptedModel([ModelUncertain()])
    with pytest.raises(ModelUncertain):
        run(request_data, model)
    assert model.requests == ["decide"]


def test_total_deadline_stops_before_another_request(request_data):
    ticks = iter([0, 121, 121, 121, 121, 121])
    model = ScriptedModel([])
    result = run(request_data, model, clock=lambda: next(ticks))
    assert model.requests == []
    assert result["status"] == "unavailable"
    assert result["diagnostics"]["stopReason"] == "deadline"


def test_invalid_finding_evidence_is_not_delivered(request_data):
    final = copy.deepcopy(output())
    final["findings"][0]["lineNumber"] = 999
    model = ScriptedModel([{"action": "finish", "calls": []}], final)
    result = run(request_data, model)
    assert result["findings"] == []
    assert result["status"] == "unavailable"
    assert result["errorCode"] == "INVALID_FINDINGS"


def test_walkthrough_requires_current_supplied_file_and_exact_quote(request_data):
    final = copy.deepcopy(output())
    final["review"]["walkthrough"][0]["evidenceRefs"][0]["evidence"] = "invented source"
    model = ScriptedModel([{"action": "finish", "calls": []}], final)
    result = run(request_data, model)
    assert result["status"] == "partial"
    assert result["review"] is None
    assert result["errorCode"] == "INVALID_REVIEW"


@pytest.mark.parametrize("stage", ["decide", "draft"])
def test_truncated_output_is_identified_without_retry_or_becoming_a_clean_review(request_data, stage):
    from app.review.llm_client import ModelReply

    class TruncatedModel(ScriptedModel):
        def decide(self, request, observations, *, timeout):
            if stage == "decide":
                self.requests.append("decide")
                return ModelReply(None, None, finish_reason="MAX_TOKENS")
            return super().decide(request, observations, timeout=timeout)

        def draft(self, request, selected, observations, *, timeout):
            self.requests.append("draft")
            return ModelReply(None, None, finish_reason="MAX_TOKENS")

    model = TruncatedModel([{"action": "finish", "calls": []}])
    result = run(request_data, model)
    assert result["status"] == "unavailable"
    assert result["errorCode"] == "MODEL_OUTPUT_TRUNCATED"
    assert result["diagnostics"]["stopReason"] == "output_limit"
    assert result["diagnostics"]["requests"][-1]["finishReason"] == "MAX_TOKENS"
    assert model.requests == (["decide"] if stage == "decide" else ["decide", "draft"])


def test_slow_provider_calls_get_headroom_but_final_call_shares_total_deadline(request_data):
    from app.review.llm_client import ModelUncertain

    now = [0.0]
    timeouts = []

    class SlowModel(ScriptedModel):
        def decide(self, request, observations, *, timeout):
            timeouts.append(timeout)
            if timeout < 45:
                raise ModelUncertain()
            now[0] += 45
            return super().decide(request, observations, timeout=timeout)

        def draft(self, request, selected, observations, *, timeout):
            timeouts.append(timeout)
            return super().draft(request, selected, observations, timeout=timeout)

    model = SlowModel([call("find_related_tests", filePath="src/policy.js"), {"action": "finish", "calls": []}])
    result = run(request_data, model, clock=lambda: now[0])
    assert result["status"] == "completed"
    assert timeouts == [60, 60, 30]
    assert model.requests == ["decide", "decide", "draft"]
