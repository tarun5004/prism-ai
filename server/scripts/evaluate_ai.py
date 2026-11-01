"""Score frozen PR fixtures and saved review outputs; Python standard library only."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import statistics
import sys

DATASET = Path(__file__).parents[2] / "docs/beta/evaluation-cases.json"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def integer(value):
    return type(value) is int and value >= 0


def validate_dataset(dataset):
    require(isinstance(dataset, dict) and dataset.get("schemaVersion") == 1, "Unsupported dataset schema")
    require(isinstance(dataset.get("version"), str) and dataset["version"], "Dataset version required")
    cases = dataset.get("cases")
    require(isinstance(cases, list) and cases, "Dataset cases required")
    ids = set()
    for case in cases:
        require(isinstance(case, dict) and isinstance(case.get("id"), str) and case["id"] and case["id"] not in ids, "Invalid/duplicate dataset case")
        ids.add(case["id"])
        require(case.get("split") in ("dev", "heldout"), "Invalid dataset split")
        require(isinstance(case.get("files"), list) and case["files"], "Case files required")
        paths = set()
        for file in case["files"]:
            require(isinstance(file, dict) and isinstance(file.get("path"), str) and file["path"] not in paths, "Invalid/duplicate file")
            paths.add(file["path"])
            for key in ("oldLines", "newLines"):
                require(isinstance(file.get(key), list) and all(isinstance(line, str) and "\n" not in line and "\r" not in line for line in file[key]), "Expected source lines")
        require(isinstance(case.get("bugs"), list), "Bug labels required, including [] for clean cases")
        bugs = set()
        for bug in case["bugs"]:
            require(isinstance(bug, dict) and isinstance(bug.get("id"), str) and bug["id"] not in bugs, "Invalid/duplicate bug ID")
            bugs.add(bug["id"])
            require(isinstance(bug.get("description"), str) and bug["description"], "Bug description required")
            require(isinstance(bug.get("locations"), list) and bug["locations"], "Bug locations required")
            for location in bug["locations"]:
                require(isinstance(location, dict), "Invalid bug location")
                file = next((file for file in case["files"] if file["path"] == location.get("filePath")), None)
                side = location.get("lineSide")
                start, end = location.get("startLine"), location.get("endLine")
                require(file is not None and side in ("old", "new") and integer(start) and integer(end)
                        and 1 <= start <= end <= len(file[side + "Lines"]), "Bug label is outside source")
    return {case["id"]: case for case in cases}


def valid_evidence(finding, case):
    if not isinstance(finding, dict):
        return False
    if not all(isinstance(finding.get(key), str) and finding[key].strip() for key in
               ("title", "filePath", "evidence", "explanation", "suggestedFix")):
        return False
    number, side = finding.get("lineNumber"), finding.get("lineSide", "new")
    file = next((file for file in case["files"] if file["path"] == finding["filePath"]), None)
    return (finding.get("severity") in ("high", "medium", "low") and integer(number) and number > 0
            and side in ("old", "new") and file is not None and number <= len(file[side + "Lines"])
            and file[side + "Lines"][number - 1].strip() == finding["evidence"].strip())


def score(dataset, run, dataset_hash):
    cases = validate_dataset(dataset)
    require(isinstance(run, dict) and run.get("schemaVersion") == 1, "Unsupported run schema")
    require(run.get("mode") in ("live", "dry-run", "synthetic"), "Unknown run mode")
    require(run.get("datasetVersion") == dataset["version"] and run.get("datasetSha256") == dataset_hash, "Dataset version/hash mismatch")
    selected = run.get("caseIds")
    require(isinstance(selected, list) and selected and all(isinstance(id, str) and id in cases for id in selected)
            and len(selected) == len(set(selected)), "Invalid/duplicate selected cases")
    require(run.get("split") in ("dev", "heldout") and all(cases[id]["split"] == run["split"] for id in selected), "Split mismatch")
    require(isinstance(run.get("cases"), list) and isinstance(run.get("judgments"), list), "Cases and judgments arrays required")
    records = {}
    for record in run["cases"]:
        require(isinstance(record, dict), "Invalid result record")
        id = record.get("caseId")
        require(isinstance(id, str) and id in selected and id not in records, "Unknown/duplicate result case")
        require(record.get("status") in ("completed", "partial", "unavailable", "skipped", "not_run"), "Invalid case status")
        require(isinstance(record.get("findings"), list), "Findings array required")
        require(record["status"] in ("completed", "partial") or not record["findings"], "Failed/unrun case cannot deliver findings")
        duration = record.get("durationMs")
        require(duration is None or (type(duration) in (int, float) and math.isfinite(duration) and duration >= 0), "Invalid duration")
        require(integer(record.get("attempts", 0)) and integer(record.get("rejectedFindings", 0)), "Invalid attempt/rejection count")
        records[id] = record
    judgments = {}
    for judgment in run["judgments"]:
        require(isinstance(judgment, dict), "Invalid human judgment")
        id, index, bug_id = judgment.get("caseId"), judgment.get("findingIndex"), judgment.get("bugId")
        require(isinstance(id, str) and id in records and integer(index) and index < len(records[id]["findings"]), "Judgment points to missing finding")
        require((id, index) not in judgments and "bugId" in judgment, "Duplicate/incomplete judgment")
        require(bug_id is None or (isinstance(bug_id, str) and any(bug["id"] == bug_id for bug in cases[id]["bugs"])), "Unknown bug label")
        require(isinstance(judgment.get("reason"), str) and judgment["reason"].strip(), "Human rationale required")
        judgments[id, index] = bug_id

    true_positive = false_positive = invalid = unreviewed = total = 0
    matched = set()
    for id, record in records.items():
        for index, finding in enumerate(record["findings"]):
            total += 1
            valid = valid_evidence(finding, cases[id])
            invalid += not valid
            key = (id, index)
            if key not in judgments:
                if valid:
                    unreviewed += 1
                else:
                    false_positive += 1
                continue
            bug_id = judgments[key]
            if bug_id is None:
                false_positive += 1
                continue
            bug = next(bug for bug in cases[id]["bugs"] if bug["id"] == bug_id)
            require(valid and any(location["filePath"] == finding["filePath"]
                    and location["lineSide"] == finding.get("lineSide", "new")
                    and location["startLine"] <= finding["lineNumber"] <= location["endLine"] for location in bug["locations"]), "Correct judgment lacks matching source evidence/location")
            if (id, bug_id) in matched:
                false_positive += 1  # Repeated alerts do not detect a second bug.
            else:
                matched.add((id, bug_id))
                true_positive += 1

    expected = sum(len(cases[id]["bugs"]) for id in selected)
    attempts = [record for record in records.values() if record.get("attempts", 0) > 0]
    durations = sorted(record["durationMs"] for record in records.values() if record.get("durationMs") is not None and record["status"] != "not_run")
    quality_ready = run["mode"] != "dry-run" and unreviewed == 0 and any(record["status"] != "not_run" for record in records.values())
    ratio = lambda numerator, denominator: numerator / denominator if denominator else None
    return {
        "runId": run.get("runId"), "mode": run["mode"], "split": run["split"],
        "datasetVersion": dataset["version"], "selectedCases": len(selected), "datasetCases": len(cases),
        "successfulCases": sum(record["status"] in ("completed", "partial") for record in records.values()),
        "partialCases": sum(record["status"] == "partial" for record in records.values()),
        "failedCases": sum(record["status"] in ("unavailable", "skipped") for record in records.values()),
        "notRunCases": sum(record["status"] == "not_run" for record in records.values()),
        "missingCases": [id for id in selected if id not in records],
        "expectedBugs": expected, "deliveredFindings": total, "unreviewedFindings": unreviewed,
        "truePositives": true_positive, "falsePositives": false_positive, "falseNegatives": expected - len(matched),
        "qualityReady": quality_ready,
        "precision": ratio(true_positive, total) if quality_ready else None,
        "recall": ratio(true_positive, expected) if quality_ready else None,
        "falseDiscoveryRate": ratio(false_positive, total) if quality_ready else None,
        "invalidEvidenceFindings": invalid, "deliveredInvalidEvidenceRate": ratio(invalid, total),
        "rejectedValidationFindings": sum(record.get("rejectedFindings", 0) for record in records.values()),
        "requestFailureRate": ratio(sum(record["status"] == "unavailable" for record in attempts), len(attempts)),
        "latencyMs": {"count": len(durations), "median": statistics.median(durations) if durations else None,
                      "p95": durations[math.ceil(len(durations) * 0.95) - 1] if durations else None},
        "limits": "Synthetic scoped fixtures; correctness needs human adjudication. Recall includes all selected expected bugs, including failed/missing cases. Unreviewed counts are provisional."
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=DATASET)
    parser.add_argument("--run", type=Path, required=True)
    args = parser.parse_args()
    try:
        raw = args.dataset.read_text(encoding="utf-8-sig").replace("\r\n", "\n").encode("utf-8")
        result = score(json.loads(raw), json.loads(args.run.read_text(encoding="utf-8")), hashlib.sha256(raw).hexdigest())
    except (OSError, ValueError, TypeError, KeyError) as error:
        print("Evaluation rejected: " + str(error), file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2, allow_nan=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
