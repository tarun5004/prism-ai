import pytest


def test_missing_judgments_are_unknown_not_perfect_quality():
    from evaluations.run import score_quality

    run = {"runId": "r1", "datasetSha256": "abc", "cases": [{"caseId": "C1", "findings": []}]}
    assert score_quality(run, [{"id": "C1", "expectedIssues": ["bug"]}], None) == {
        "precision": None, "recall": None, "judgedCases": 0, "reason": "human judgments required"}


def test_frozen_run_labels_compute_quality_and_reject_stale_duplicate_or_foreign_labels():
    from evaluations.run import score_quality

    run = {"runId": "r1", "datasetSha256": "abc", "cases": [{"caseId": "C1", "findings": [{}, {}]}]}
    cases = [{"id": "C1", "expectedIssues": ["bug", "missing-bug"]}]
    judgments = {"runId": "r1", "datasetSha256": "abc", "cases": [{"caseId": "C1", "reviewed": True,
        "findings": [{"index": 0, "verdict": "correct", "issueId": "bug"}, {"index": 1, "verdict": "incorrect", "issueId": None}]}]}
    score = score_quality(run, cases, judgments)
    assert score["precision"] == 0.5
    assert score["recall"] == 0.5
    for labels in [judgments | {"runId": "stale"}, judgments | {"datasetSha256": "stale"},
                   judgments | {"cases": judgments["cases"] * 2}]:
        with pytest.raises(ValueError):
            score_quality(run, cases, labels)


def test_cost_requires_dated_model_prices_and_complete_attempt_usage():
    from app.review.metrics import estimate_cost

    rates = {"model": "explicit-model", "asOf": "2026-11-18", "inputUsdPerMillion": 1, "outputUsdPerMillion": 2}
    attempts = [{"usage": {"inputTokens": 100, "outputTokens": 50, "thinkingTokens": 0}}]
    assert estimate_cost(attempts, "explicit-model", None)["estimatedUsd"] is None
    assert estimate_cost(attempts, "other-model", rates)["estimatedUsd"] is None
    assert estimate_cost(attempts + [{"usage": None}], "explicit-model", rates)["estimatedUsd"] is None
    assert estimate_cost([{"usage": {"inputTokens": 100, "outputTokens": 50}}], "explicit-model", rates)["estimatedUsd"] is None
    assert estimate_cost(attempts, "explicit-model", rates)["estimatedUsd"] == 0.0002
    assert estimate_cost(attempts, "explicit-model", rates | {"inputUsdPerMillion": -1})["estimatedUsd"] is None
