"""Offline metric checks. No provider, database or third-party Python packages."""
import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("evaluate_ai", Path(__file__).parents[1] / "scripts/evaluate_ai.py")
evaluator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evaluator)


class EvaluationTests(unittest.TestCase):
    def setUp(self):
        self.dataset = {"schemaVersion": 1, "version": "test-v1", "cases": [
            {"id": "bug", "split": "dev", "title": "Division", "files": [{"path": "a.js", "oldLines": [], "newLines": ["return price / quantity;"]}],
             "bugs": [{"id": "divide", "description": "Should multiply", "locations": [{"filePath": "a.js", "lineSide": "new", "startLine": 1, "endLine": 1}]}]},
            {"id": "clean", "split": "dev", "title": "Clean", "files": [{"path": "b.js", "oldLines": [], "newLines": ["return price * quantity;"]}], "bugs": []}
        ]}
        self.finding = {"title": "Wrong operation", "severity": "medium", "filePath": "a.js", "lineNumber": 1, "lineSide": "new", "evidence": "return price / quantity;", "explanation": "Divides instead of multiplying", "suggestedFix": "Multiply"}
        self.run = {"schemaVersion": 1, "runId": "test", "mode": "synthetic", "datasetVersion": "test-v1", "datasetSha256": "hash", "caseIds": ["bug", "clean"], "split": "dev", "cases": [
            {"caseId": "bug", "status": "completed", "findings": [self.finding], "durationMs": 100, "attempts": 1, "rejectedFindings": 0},
            {"caseId": "clean", "status": "completed", "findings": [], "durationMs": 200, "attempts": 1, "rejectedFindings": 0}
        ], "judgments": []}

    def score(self):
        return evaluator.score(self.dataset, self.run, "hash")

    def judge(self, case="bug", index=0, bug="divide"):
        self.run["judgments"].append({"caseId": case, "findingIndex": index, "bugId": bug, "reason": "Manually checked behavior"})

    def test_location_alone_does_not_prove_correct_reasoning(self):
        result = self.score()
        self.assertEqual(result["unreviewedFindings"], 1)
        self.assertIsNone(result["precision"])
        self.assertIsNone(result["recall"])
        self.judge()
        result = self.score()
        self.assertEqual((result["truePositives"], result["falsePositives"], result["falseNegatives"]), (1, 0, 0))
        self.assertEqual(result["precision"], 1)
        self.assertEqual(result["latencyMs"]["median"], 150)

    def test_false_alert_and_duplicate_change_metrics(self):
        self.judge()
        self.run["cases"][0]["findings"].append(copy.deepcopy(self.finding))
        self.judge(index=1)
        self.run["cases"][1]["findings"] = [{**self.finding, "filePath": "b.js", "evidence": "return price * quantity;"}]
        self.judge("clean", 0, None)
        result = self.score()
        self.assertEqual(result["truePositives"], 1)
        self.assertEqual(result["falsePositives"], 2)
        self.assertAlmostEqual(result["precision"], 1 / 3)
        self.assertAlmostEqual(result["falseDiscoveryRate"], 2 / 3)

    def test_failed_and_missing_cases_stay_in_recall_denominator(self):
        self.run["cases"][0].update(status="unavailable", findings=[])
        result = self.score()
        self.assertEqual(result["recall"], 0)
        self.assertEqual(result["requestFailureRate"], 0.5)
        self.run["cases"].pop(0)
        result = self.score()
        self.assertEqual(result["missingCases"], ["bug"])
        self.assertEqual(result["falseNegatives"], 1)

    def test_invalid_evidence_cannot_be_a_true_positive(self):
        self.run["cases"][0]["findings"][0]["lineNumber"] = 900
        result = self.score()
        self.assertEqual(result["invalidEvidenceFindings"], 1)
        self.assertEqual(result["falsePositives"], 1)
        self.judge()
        with self.assertRaises(ValueError):
            self.score()

    def test_zero_denominators_and_dry_run_are_not_fake_accuracy(self):
        self.run["cases"][0]["findings"] = []
        self.assertIsNone(self.score()["precision"])
        self.run["mode"] = "dry-run"
        for case in self.run["cases"]:
            case.update(status="not_run", durationMs=None, attempts=0)
        result = self.score()
        self.assertIsNone(result["recall"])
        self.assertIsNone(result["requestFailureRate"])
        self.assertEqual(result["notRunCases"], 2)

    def test_rejects_stale_hash_duplicate_unknown_cases_and_bad_judgments(self):
        baseline = copy.deepcopy(self.run)
        mutations = [lambda: self.run.update(datasetSha256="stale"),
                     lambda: self.run["cases"].append(copy.deepcopy(self.run["cases"][0])),
                     lambda: self.run["caseIds"].append("unknown"),
                     lambda: self.run["cases"][0].update(status="invented"),
                     lambda: self.run["cases"][0].update(durationMs=-1),
                     lambda: self.run["judgments"].append({"caseId": "bug", "findingIndex": 4, "bugId": "divide", "reason": "wrong index"})]
        for mutate in mutations:
            self.run = copy.deepcopy(baseline)
            mutate()
            with self.assertRaises(ValueError):
                self.score()

    def test_frozen_dataset_labels_are_valid_and_splits_are_separate(self):
        import json
        dataset = json.loads(evaluator.DATASET.read_text(encoding="utf-8"))
        cases = evaluator.validate_dataset(dataset)
        self.assertEqual(len(cases), 16)
        self.assertEqual(sum(case["split"] == "heldout" for case in cases.values()), 4)
        self.assertEqual(sum(bool(case["bugs"]) for case in cases.values()), 10)
        broken = copy.deepcopy(dataset)
        broken["cases"][0]["bugs"][0]["locations"][0]["endLine"] = 900
        with self.assertRaises(ValueError):
            evaluator.validate_dataset(broken)


if __name__ == "__main__":
    unittest.main()
