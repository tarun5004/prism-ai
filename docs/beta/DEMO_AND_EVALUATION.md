# PRism Beta Demo and Evaluation

## Before the Demo

1. Clone or open the project from a clean working tree.
2. Copy `server/.env.example` to `server/.env` when environment values are needed.
3. Run `npm run install:all`.
4. Start the app with `npm run dev`.
5. Prepare the four Pull Request URLs in [TEST_CASES.md](TEST_CASES.md).
6. Confirm that GitHub access is available for the selected repository.

MongoDB is optional for the local demo. Without `MONGODB_URI`, the API uses in-memory history. With MongoDB configured, the same report shape is stored persistently.

## Demo Order

1. Open the PRism dashboard.
2. Paste a prepared Pull Request URL.
3. Submit the analysis and show the Pull Request summary.
4. Point out changed files and the finding count.
5. Open one finding and show its category, severity, evidence, affected files, and recommended action.
6. Point out whether the finding source is `rule` or `ai`.
7. Open a previous analysis from the history list.
8. Submit an invalid URL to demonstrate a visible failure state.
9. Explain that the final merge decision remains with the human reviewer.

## What to Explain

- GitHub supplies the Pull Request facts.
- PRism applies small transparent rules to those facts.
- The optional AI adapter receives limited context and must return the existing finding shape.
- The report separates evidence from generated reasoning.
- The beta does not block merges or claim to find every defect.

## Evaluation Notes

Record one row per test case in [TEST_CASES.md](TEST_CASES.md). Use the following simple measures:

### Finding precision

`correct findings / total findings`

### Finding recall

`correctly detected expected findings / total expected findings`

### False-discovery rate

`false-positive findings / total findings`

This is not the conventional false-positive rate `FP / (FP + TN)`. A count of all possible non-bugs in a PR is not well-defined, so do not claim that FPR here. Zero-denominator rates are undefined, not automatically 0% or 100%.

For frozen synthetic code cases and reproducible scoring, use [evaluation-cases.json](evaluation-cases.json) and `python -B server/scripts/evaluate_ai.py --run PATH_TO_RUN_JSON`. Existing four-case manual rule checks are separate from AI semantic-quality evaluation.

### Response time

Measure from submission until the report is visible. Record whether the run used the AI provider, because provider latency can change the result.

Do not claim that four cases represent general accuracy. Present the numbers as observations from the prepared beta set and include the test limitations.

## Beta Exit Check

- All four cases have recorded URLs and observations.
- At least one report has been reopened from history.
- Invalid input produces a visible error.
- Rule-only mode works without AI credentials.
- Every reported finding can be traced to evidence.
- No merge decision is made automatically.


## AI Evaluation V1: frozen code cases

This is a small synthetic benchmark for the current review engine, not a claim about all real-world PRs. Fixtures are original JavaScript examples with explicit contracts: 12 development cases and 4 held-out cases, including 10 known bugs, clean changes, incomplete context and adversarial PR text. They use full-file replacement patches and are never executed. Inspect the labels before using them; a human-created dataset can still contain mistakes. Do not tune prompts against the held-out split.

Python 3.10+ is needed only for offline scoring. No pip packages, database, GitHub access, new service or UI are required. The Node collector reuses `prepareAiInput` and `runAiAnalysis` with frozen code; it does not fetch GitHub context. This measures supplied-context review, not live GitHub retrieval or webhook reliability.

### 1. Verify the wiring without any model spend

From the repository root in PowerShell:

```powershell
$evalStamp = Get-Date -Format yyyyMMdd-HHmmss
$evalPath = Join-Path $env:TEMP "prism-eval-$evalStamp.json"
node server/scripts/evaluate-ai.js --out "$evalPath"
python -B server/scripts/evaluate_ai.py --run "$evalPath"
```

Default collection is **dry-run** over the development split. It validates/prepares inputs and writes `not_run` case records. `precision`, `recall` and `requestFailureRate` are `null`; the output is plumbing evidence, not model-quality evidence. Use a new output path for each run: the collector refuses to overwrite existing files. Dataset hashes normalize UTF-8 BOM/CRLF so checkout line endings do not change case identity.

### 2. Collect a real model run only when you choose to

These commands make actual Gemini API requests using `server/.env`. They may use paid API quota; a separate consumer/student subscription does not automatically prove API credit coverage. The default workflow makes no live calls.

```powershell
# Exactly one selected case; no automatic retry
node server/scripts/evaluate-ai.js --live --case B01 --out "$env:TEMP/prism-eval-B01-live.json"

# Optional later: 12 sequential development requests, explicitly selected
node server/scripts/evaluate-ai.js --live --split dev --out "$env:TEMP/prism-eval-dev-live.json"
```

Use `--split heldout` only for a frozen checkpoint, not repeated prompt tuning. `--case` and `--split` are mutually exclusive. Batch collection saves each case, keeps provider/configuration failures, and continues to remaining selected cases. If a process stops mid-case, its saved record is marked interrupted; there is no automatic resume/retry. Inspect the artifact before deciding whether to spend another request. The CLI returns a nonzero exit code when a selected case fails/skips, while preserving the run file.

The artifact includes run ID/time, dataset version/hash, selected case IDs/split, AI-service/context source hashes, actual model and deadline when available, findings, rejection counts, attempts and case timing. No gold bugs/labels are sent to Gemini. Future token-usage diagnostics are a separate E2 task.

### 3. Judge meaning, not just the cited line

After reading each delivered finding against its fixture, copy the artifact to a judged run file and add entries to its `judgments` array:

```json
{
  "caseId": "B01",
  "findingIndex": 0,
  "bugId": "B01-bug",
  "reason": "The finding correctly explains unauthorized deletion after the owner guard was removed."
}
```

`findingIndex` is zero-based. A confirmed false alarm uses `"bugId": null` plus a reason. Do not add a judgment for a nonexistent finding. If a legitimate new issue is missing from the labels, review/version the dataset instead of calling it a false alarm just to fit the expected answer. A correct label also needs a valid file, old/new side, matching evidence and an allowed label location. A second finding for the same bug counts as a duplicate false alert, not a second detected bug.

Score the judged copy with `python -B server/scripts/evaluate_ai.py --run PATH_TO_JUDGED_JSON`. Same-line findings are **not automatically correct**. While valid delivered findings remain unreviewed, headline precision/recall/FDR stay `null`. `truePositives`, `falsePositives` and `falseNegatives` are provisional counts until adjudication is complete. Never present `synthetic` test-mode results as live model results.

### 4. Read the metrics with their denominators

| Output | Meaning |
| --- | --- |
| Precision | Confirmed true findings / delivered findings after adjudication |
| Recall | Detected labelled bugs / all expected bugs in the selected cases, including failed/missing cases |
| False-discovery rate | False/duplicate alerts / delivered findings; this is not conventional FPR |
| Delivered invalid-evidence rate | Delivered findings with invalid schema/source evidence / delivered findings; rejected raw SDK outputs are not available for semantic grading |
| Rejected validation findings | The production validator's aggregate rejection count; not automatically an evidence-only rejection count |
| Request failure rate | Unavailable cases / cases with a confirmed request attempt; skipped, interrupted-with-unknown-attempt and missing cases stay visible separately |
| Case latency | Median/p95 observed collection durations, excluding `not_run`; not full GitHub-to-UI latency |
| Coverage | Selected/successful/partial/failed/not-run/missing counts; do not compare runs that silently use different selections |

Undefined ratios are `null`, not fabricated 0%/100%. A tiny selected subset is not a full-dataset result. Do not drop failed cases or mix rule-based findings into AI scores. This evaluator scores the actual validated `runAiAnalysis` findings, not an LLM-generated grade.

### Offline regression commands

```powershell
python -B -m unittest discover -s server/test -p evaluation_test.py
node --test server/test/evaluation.test.js
```

Python tests deliberately seed misses, false alerts, duplicate findings, invalid evidence and malformed runs. Node tests exercise dry collection and inject a mocked analysis function for the opt-in path. Neither command uses live GitHub/Gemini, and passing them does not publish an AI accuracy score.
