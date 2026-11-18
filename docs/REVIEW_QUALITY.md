# Review-quality investigation — 18 November 2026

## Outcome

The same configured `gemini-3.1-flash-lite` model now identifies the owned Boolean-policy bug through the real Node HTTP client → private FastAPI → LangGraph → Gemini path. The final smoke returned **completed**, one supported finding, a valid review, one successful source read, three provider requests, **12,259 ms** agent duration and **4,101 provider-reported total tokens**. No alternate model/provider was purchased or silently selected.

This establishes one working live review, not CodeRabbit parity or reliable detection of every bug. Earlier/intermediate failures are preserved below. The extension remains local/opt-in; the deployed default engine was not changed. The existing localhost:5055 example remains a **scripted** demo, not this live result.

## What was actually wrong

1. **Weak investigation guidance.** The original short prompt allowed an intent-following summary to substitute for checking behavior. One live result called the incorrect `!isDraft || !reviewsPaused` expression correct; another inferred an unseen helper was defective. New instructions require a concrete trigger, actual/expected consequence, relevant boundary/condition checks and a challenge to unsupported assumptions. They explicitly allow empty findings and missing-context abstention.
2. **Unspecified reasoning effort.** Google documents this Lite model's default as minimal thinking. The adapter now explicitly uses low planning effort and medium final-review effort for Gemini 3, with a server-owned override/provider-default opt-out. The supported `models/` prefix is normalized when detecting the family. High effort was tried but produced speculative findings; more thinking was not consistently better.
3. **Output space shared with hidden thinking.** The old 512-token planner/4,096-token final allowances left too little space for structured JSON. A clean-case final attempt reported 3,932 thinking tokens and only148 visible output tokens; a planner attempt reported489 thinking tokens and7 visible output tokens. Current finite caps are2,048/8,192. Public provider finish reasons are retained; MAX_TOKENS stops with MODEL_OUTPUT_TRUNCATED/output_limit and no automatic retry. Offline SDK and graph tests verify the classification. Earlier failures lack finish metadata, so their truncation diagnosis is an inference from counters, not a recovered provider finish code.
4. **Walkthrough membership was under-constrained at generation time.** An owned diagnostic trace proved that an unchanged retrieved test was inserted into the changed-file walkthrough, causing a correct bug finding to accompany a rejected review. The output schema now restricts walkthrough paths to the actual changed-file enum. Tests/context remain valid evidence references. Independent validators still reject incorrect membership, coordinates and quotes.
5. **Unclear source coordinates/tool guidance.** Selected source is now explicitly numbered, and read-window instructions refer to the supplied inclusive bounds. Foreign or oversized reads remain denied; nothing expands repository access.

This is prompt, context and inference-configuration engineering. **No model weights were fine-tuned.** No shell execution, agent swarm, vector service, repeated judge loop or additional infrastructure was added.

## Live evaluation record

All cases are small owned synthetic snapshots. Expected labels and authored scripted outputs never enter live model requests. The original four-case dataset was unchanged; a separate four-case null/expiry dataset was frozen before its first inference, with an explicit null-or-object contract. The second set is additional regression coverage, not an independently collected blind benchmark. Hashes and run IDs are retained in the local artifacts.

| Run tag | Cases | Observed outcome |
| --- | ---: | --- |
| baseline |4| Policy bug found once; injection-context case rejected; clean report rejected; unsupported missing-helper finding |
| revised |4| Both policy bugs surfaced; clean response truncated; one walkthrough rejected; missing-helper false alarm absent |
| final (intermediate high-effort tag) |4| One policy bug surfaced; one invalid decision; speculative clean-code finding; missing context abstained |
| holdout (high effort) |4| Expiry bug found; null bug unavailable; unsupported undefined-input finding on null-or-object clean case |
| medium |4| Policy bug found, clean case had no finding; two invalid decisions with near-cap output counters |
| validated (v3/medium, larger planner cap) |4| Policy finding accepted but walkthrough rejected; clean/missing-context cases had no findings; injection-context case had an uncertain provider outcome |
| validated-holdout (v3/medium) |4| Null-before-guard and expiry-equality bugs found; both correct counterparts had no findings; all four reviews validated |

In the last v3/medium batches, **three expected defects surfaced**, four clean/insufficient-context cases had no findings, and one expected-bug case remained **unknown**. This is an engineering assessment by the implementing assistant, not independent human adjudication. The existing evaluator correctly retains precision/recall as null. These counts do not establish general accuracy, and grouped changes prevent causal claims about any single prompt or thinking setting.

The final changed-file schema fix followed those batches. One fresh real Node→FastAPI smoke then completed with the policy bug and valid report. It does **not** replace the uncertain case or imply the full eight-case batch was rerun after that final schema constraint. No uncertain operation was automatically replayed.

Across this investigation: **31 synthetic reviews**, **76 recorded provider attempts**, **95,528 recorded total tokens**, plus incomplete usage from one uncertain case. These are known subtotals, not complete billing totals. Costs remain unknown because complete usage and dated price configuration are absent. No load test was run; reviews were sequential, bounded experiments on the existing model. No further live trials are needed to describe the current result honestly.

Local artifacts (preserved, not committed): `quality-run-summary.json`, all seven `quality-<tag>.json` files, owned diagnostic traces, and final HTTP result `live-2026-11-18T13-04-16-968Z.json`. These originally lived in `tmp/agent-implementation/`; release cleanup archived the directory outside the source checkout with verified backups. The summary verifies dataset hashes and records final source hashes. Existing user PDF/output files were preserved.

## Verification and remaining limits

- Python tests include actual SDK transport interception: effort/opt-out, supported model prefix, explicit source coordinates, output schema path enum and provider truncation metadata. Graph tests prove truncated decisions/finals stop without replay or a clean result. Node tests preserve prompt/effort/finish metadata and reject foreign evidence.
- Private reasoning is disabled in returned model output and never added to prompts/logs as a transcript. Temporary diagnostic traces contain only final decisions/reports for the owned synthetic fixture, not hidden thoughts or private repository content.
- Request/round/tool/deadline caps, unknown-outcome protection, Node authorization and human publication approval remain. No commit, push, GitHub write or Azure rollout was performed.
- **Deferred minor:** unusually blank-line-heavy source can expand when represented as numbered JSON lines, increasing input-token overhead within the finite source/request limits. A compact representation or post-transform cap is a later cost improvement.
- Summary wording can still sound too confident; validators establish source traceability, not semantic truth. Provider uncertainty and omitted repository context remain real limitations. A broader, independently judged multi-file dataset is needed before claiming reliable review quality.

## Is a paid model required?

Payment is not a correctness guarantee. These samples demonstrate useful findings on the existing Lite model after engineering fixes. They also show variability, speculative findings at high effort and an uncertain provider response. For difficult cross-file reviews, a stronger reasoning/coding model may help; that must be tested on the **same frozen cases**, with approved pricing/budget, before changing the product default. We did not silently switch to one or claim that prompts can erase model capability limits.

## Primary references and what we adopted

- [Google: model positioning](https://aistudio.google.com/docs/models/gemini-3.1-flash-lite): this is a lightweight/high-throughput model. Used to avoid treating it as automatically equivalent to stronger coding models.
- [Google: thinking controls](https://aistudio.google.com/docs/thinking): explicit effort, shared reasoning/output allowance, and evaluation of the lowest effort meeting the task's bar. Adopted configurable stage effort and sufficient finite JSON space; no hidden reasoning extraction.
- [Anthropic: Building effective agents](https://www.anthropic.com/research/building-effective-agents): simple composable patterns and clear tool interfaces. Adopted targeted repairs inside the existing loop rather than a new multi-agent architecture.
- [CR-Bench paper](https://arxiv.org/abs/2603.11078): bug discovery and spurious findings must be evaluated together; extra reflection can add noise. Adopted clean counterparts, missing-context cases, preserved failures and explicit limits on quality claims.

These references informed the changes; their published results are not Prism AI's measured results.
