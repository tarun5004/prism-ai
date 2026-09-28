# PRism Beta Test Cases

Use a small private or public test repository and create one Pull Request for each case. Record the final URL in the table before running the demo.

## Expected Finding Rules

The expected results below describe signals, not proof of defects. A reviewer must still inspect the evidence.

| ID | Pull Request shape | Expected signals | Why it matters |
| --- | --- | --- | --- |
| TC-01 | Change a route, controller, API, schema, or service file without changing its contract documentation | `breaking-change`; usually `test-gap` | Checks API-facing change detection |
| TC-02 | Change an authentication, permission, token, password, or database file | `security-concern`; usually `test-gap` | Checks high-attention security signaling |
| TC-03 | Change eight or more files, including a shared utility and its callers | `hidden-impact`; usually `test-gap` | Checks broad-change prioritization |
| TC-04 | Change only a test or spec file | No required risk signal | Checks that the report can be useful with no findings |

## Run Record

Complete this table during the evaluation. Do not fill observed values before running the analysis.

| ID | Pull Request URL | Expected | Observed | False positives | Misses | Response time |
| --- | --- | --- | --- | --- | --- | --- |
| TC-01 | _Add URL_ |  |  |  |  |  |
| TC-02 | _Add URL_ |  |  |  |  |  |
| TC-03 | _Add URL_ |  |  |  |  |  |
| TC-04 | _Add URL_ |  |  |  |  |  |

## Classification Rules

- Correct: the finding category is expected and the evidence supports it.
- False positive: the finding is not relevant to the Pull Request after manual inspection.
- Miss: an expected signal is absent from the report.
- Partial: the category is useful but the evidence or affected-file list is incomplete.

## Regression Use

Run the same four cases after changes to the rule logic, context selection, or AI prompt. Keep the previous run record so improvements and regressions are visible.