"""Small offline/live-opt-in evaluator. Scripted transport is not model quality."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from uuid import uuid4


def score_quality(run, cases, judgments):
    if not judgments:
        return {"precision": None, "recall": None, "judgedCases": 0, "reason": "human judgments required"}
    if judgments.get("runId") != run["runId"] or judgments.get("datasetSha256") != run["datasetSha256"]:
        raise ValueError("Judgments refer to a different frozen run or dataset")
    expected = {case["id"]: set(case["expectedIssues"]) for case in cases}
    observed = {case["caseId"]: case for case in run["cases"]}
    if len(observed) != len(run["cases"]) or set(observed) != set(expected):
        raise ValueError("Run must cover each dataset case once")
    seen, correct, judged, matched, expected_count = set(), 0, 0, 0, 0
    for case in judgments["cases"]:
        key = case["caseId"]
        if key in seen or key not in observed or case.get("reviewed") is not True:
            raise ValueError("Duplicate, foreign or incomplete case judgment")
        seen.add(key)
        labels, indices, issues = case["findings"], set(), set()
        for label in labels:
            index = label["index"]
            if type(index) is not int or index in indices or not 0 <= index < len(observed[key]["findings"]):
                raise ValueError("Duplicate or foreign finding index")
            indices.add(index)
            if label["verdict"] == "correct":
                issue = label.get("issueId")
                if issue not in expected[key] or issue in issues:
                    raise ValueError("Correct findings need distinct expected issue IDs")
                issues.add(issue)
                correct += 1
            elif label["verdict"] != "incorrect":
                raise ValueError("Use correct or incorrect")
        if len(indices) != len(observed[key]["findings"]):
            raise ValueError("Label every finding in a reviewed case")
        judged += len(indices)
        matched += len(issues)
        expected_count += len(expected[key])
    if seen != set(expected):
        raise ValueError("Review every case before comparing model quality")
    return {"precision": correct / judged if judged else None, "recall": matched / expected_count if expected_count else None,
            "judgedCases": len(seen), "reason": "human-adjudicated labels for this exact frozen run"}


class FixtureModel:
    """Exercises real graph/tools using authored output, never impersonates an LLM."""
    provenance = "scripted-fixture"

    def __init__(self, output):
        self.output = output

    def decide(self, request, observations, *, timeout):
        from app.review.llm_client import ModelReply

        if any("tool" in observation for observation in observations):
            value = {"action": "finish", "calls": []}
        else:
            tests = any(source.role == "related-test" for source in request.sources)
            value = {"action": "tools", "calls": [{"name": "find_related_tests" if tests else "inspect_pr_snapshot",
                     "arguments": {"filePath": request.files[0].filePath} if tests else {}}]}
        return ModelReply(value, None)

    def draft(self, request, selected, observations, *, timeout):
        from app.review.llm_client import ModelReply

        return ModelReply(self.output, None)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", default=str(Path(__file__).resolve().parents[2] / "docs/beta/agent-evaluation-cases.json"))
    parser.add_argument("--output", required=True)
    parser.add_argument("--mode", choices=["scripted", "live"], default="scripted")
    parser.add_argument("--allow-paid", action="store_true")
    parser.add_argument("--judgments")
    parser.add_argument("--run", help="Score an existing frozen run; makes no model calls")
    args = parser.parse_args()
    raw = Path(args.dataset).read_bytes()
    dataset = json.loads(raw)
    cases = dataset["cases"]
    if args.run:
        run = json.loads(Path(args.run).read_text(encoding="utf-8"))
        if run["datasetSha256"] != hashlib.sha256(raw).hexdigest():
            parser.error("Run and dataset differ")
    else:
        from app.config import Settings
        from app.review.workflow import run_review
        from app.review.llm_client import GeminiModel, ModelUncertain
        from app.review.schemas import AgentRequest

        settings = Settings.from_env()
        if args.mode == "live" and (not args.allow_paid or not settings.api_key or not settings.model):
            parser.error("Live calls require --allow-paid plus explicit key/model environment configuration")
        run = {"runId": str(uuid4()), "createdAt": datetime.now(timezone.utc).isoformat(), "mode": args.mode,
               "datasetSha256": hashlib.sha256(raw).hexdigest(), "cases": []}
        for case in cases:
            model = GeminiModel(settings) if args.mode == "live" else FixtureModel(case["scriptedOutput"])
            try:
                response = run_review(AgentRequest.model_validate(case["request"]), model, settings)
            except ModelUncertain:
                response = {"status": "unknown", "findings": [], "errorCode": "MODEL_REQUEST_UNCERTAIN"}
            run["cases"].append({"caseId": case["id"], **response})
    labels = json.loads(Path(args.judgments).read_text(encoding="utf-8")) if args.judgments else None
    run["quality"] = score_quality(run, cases, labels)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(run, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"mode": run["mode"], "cases": len(run["cases"]), "quality": run["quality"]}))


if __name__ == "__main__":
    main()
