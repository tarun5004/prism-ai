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

### False-positive rate

`false-positive findings / total findings`

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