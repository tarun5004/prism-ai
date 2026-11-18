"""One small per-request graph. Durable outer recovery belongs to Node."""
import json
import time
from typing import TypedDict

from langgraph.graph import END, START, StateGraph
from langsmith import tracing_context
from pydantic import ValidationError

from app.review.llm_client import ModelRejected, ModelUncertain
from app.review.schemas import AgentDecision
from app.review.tools import execute_tool
from app.review.validation import validate_output
from app.review.metrics import estimate_cost, summarize_usage
from app.review.prompts import PROMPT_VERSION


class AgentState(TypedDict):
    rounds: int
    toolCalls: int
    selected: dict
    observations: list
    events: list
    seen: list
    decision: dict
    stopReason: str
    result: dict
    invalid: bool


class BudgetReached(Exception):
    def __init__(self, reason):
        self.reason = reason


def run_review(request, model, settings, *, clock=time.monotonic, sleep=time.sleep):
    started = clock()
    attempts = []
    retry_used = False

    def invoke(stage, work):
        nonlocal retry_used
        reserve = 1 if stage == "decide" else 0
        while True:
            remaining = settings.deadline_seconds - (clock() - started)
            if remaining <= 0:
                raise BudgetReached("deadline")
            if len(attempts) >= settings.max_requests - reserve:
                raise BudgetReached("request_budget")
            entry = {"stage": stage, "status": "started", "usage": None}
            attempts.append(entry)
            began = clock()
            try:
                reply = work(min(settings.attempt_seconds, remaining))
                entry.update(status="completed", usage=reply.usage)
                if reply.finish_reason is not None:
                    entry["finishReason"] = reply.finish_reason
                return reply.value
            except ModelRejected as error:
                entry.update(status="rejected", httpStatus=error.status)
                delay = error.retry_after
                if (error.status != 429 or retry_used or len(attempts) >= settings.max_requests - reserve
                        or delay >= settings.deadline_seconds - (clock() - started)):
                    raise
                retry_used = True
                sleep(delay)
            except ModelUncertain:
                entry["status"] = "unknown"
                raise
            finally:
                entry["durationMs"] = max(0, round((clock() - began) * 1000))

    def observations(state):
        # Context occurs only once, not once per search/tool transcript.
        return [*state["observations"], {"selectedContext": list(state["selected"].values())}]

    def decide(state):
        if state["rounds"] >= settings.max_rounds:
            return {"stopReason": "round_budget", "decision": {}}
        try:
            value = invoke("decide", lambda timeout: model.decide(request, observations(state), timeout=timeout))
            if attempts[-1].get("finishReason") == "MAX_TOKENS":
                return {"invalid": True, "stopReason": "output_limit"}
            decision = AgentDecision.model_validate(value)
            return {"rounds": state["rounds"] + 1, "decision": decision.model_dump(exclude_none=True),
                    "stopReason": "sufficient_evidence" if decision.action == "finish" else ""}
        except ValidationError:
            return {"invalid": True, "stopReason": "invalid_decision"}
        except BudgetReached as error:
            return {"stopReason": error.reason, "decision": {}}
        except ModelRejected:
            return {"invalid": True, "stopReason": "provider_rejected"}

    def tools(state):
        selected, events, seen = dict(state["selected"]), list(state["events"]), list(state["seen"])
        notes, count, reason = list(state["observations"]), state["toolCalls"], ""
        useful = False
        for call in state["decision"].get("calls", []):
            key = json.dumps(call, sort_keys=True)
            if key in seen:
                reason = "repeated_tool"
                break
            if count >= settings.max_tools:
                reason = "tool_budget"
                break
            seen.append(key)
            count += 1
            before = clock()
            result = execute_tool(request, call["name"], call["arguments"])
            refs = []
            for source in result.get("sources", []):
                previous = selected.get(source["sourceId"])
                if previous:
                    original = next(s for s in request.sources if s.sourceId == source["sourceId"])
                    lo = min(previous["startLine"], source["startLine"])
                    hi = max(previous["startLine"] + len(previous["code"].split("\n")),
                             source["startLine"] + len(source["code"].split("\n")))
                    source = original.model_dump() | {"startLine": lo, "code": "\n".join(
                        original.code.split("\n")[lo-original.startLine:hi-original.startLine])}
                selected[source["sourceId"]] = source
                refs.append({k: source[k] for k in ["sourceId", "filePath", "lineSide", "startLine", "revision"]}
                            | {"endLine": source["startLine"] + len(source["code"].split("\n")) - 1})
            useful |= result["status"] == "ok"
            notes.append({"tool": call["name"], **{k: v for k, v in result.items() if k != "sources"}})
            events.append({"tool": call["name"], "status": result["status"], "sources": refs,
                           "durationMs": max(0, round((clock() - before) * 1000))})
        if not reason and not useful:
            reason = "no_new_context"
        if not reason and state["rounds"] >= settings.max_rounds:
            reason = "round_budget"
        return {"selected": selected, "events": events, "seen": seen, "observations": notes,
                "toolCalls": count, "stopReason": reason}

    def draft(state):
        try:
            value = invoke("draft", lambda timeout: model.draft(
                request, list(state["selected"].values()), state["observations"], timeout=timeout))
            if attempts[-1].get("finishReason") == "MAX_TOKENS":
                return {"invalid": True, "stopReason": "output_limit"}
            findings, review, error = validate_output(value, request, list(state["selected"].values()))
            limited = state["stopReason"] != "sufficient_evidence" or any(request.coverage.get(key) for key in
                ["skippedFiles", "truncatedFiles", "contextOmissions"]) or request.coverage.get("filesComplete") is False
            status = "unavailable" if error and not findings else "partial" if error or limited else "completed"
            return {"result": {"status": status, "findings": findings, "review": review, "errorCode": error}}
        except BudgetReached as error:
            return {"stopReason": error.reason, "invalid": True}
        except ModelRejected:
            return {"stopReason": "provider_rejected", "invalid": True}

    graph = StateGraph(AgentState)
    graph.add_node("decide", decide)
    graph.add_node("tools", tools)
    graph.add_node("draft", draft)
    graph.add_edge(START, "decide")
    graph.add_conditional_edges("decide", lambda s: END if s["invalid"] else
                                "tools" if s["decision"].get("action") == "tools" else "draft")
    graph.add_conditional_edges("tools", lambda s: "draft" if s["stopReason"] else "decide")
    graph.add_edge("draft", END)
    # Environment-level tracing must never upload private graph inputs/source text.
    with tracing_context(enabled=False):
        state = graph.compile().invoke({"rounds": 0, "toolCalls": 0, "selected": {}, "observations": [],
            "events": [], "seen": [], "decision": {}, "stopReason": "", "result": {}, "invalid": False},
            config={"recursion_limit": 12, "callbacks": []})
    error = ("MODEL_OUTPUT_TRUNCATED" if state["stopReason"] == "output_limit" else
             "INVALID_DECISION" if state["invalid"] else "MODEL_UNAVAILABLE")
    result = state["result"] or {"status": "unavailable", "findings": [], "review": None, "errorCode": error}
    return {"schemaVersion": "prism-agent-v1", "reviewId": request.reviewId, "scope": request.scope.model_dump(),
            **result, "diagnostics": {"provider": "gemini", "model": settings.model,
            "promptVersion": PROMPT_VERSION, "thinkingLevel": getattr(model, "review_thinking_level", "provider"),
            "provenance": getattr(model, "provenance", "injected-provider"),
            "events": state["events"], "stopReason": state["stopReason"], "toolCalls": state["toolCalls"],
            "rounds": state["rounds"], "attempts": len(attempts), "requests": attempts,
            "usage": summarize_usage(attempts), "cost": estimate_cost(attempts, settings.model, settings.prices),
            "durationMs": max(0, round((clock() - started) * 1000))}}
