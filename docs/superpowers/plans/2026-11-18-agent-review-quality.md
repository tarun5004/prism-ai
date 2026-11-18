# Agent review quality repair plan

> **For agentic workers:** Use superpowers:executing-plans task by task. This repairs the owner-approved bounded Python review design; it does not add a new agent architecture or provider.

**Goal:** Measure and reduce observed false negatives without weakening evidence checks, claiming every bug is detectable, or forcing findings on clean code.
**Architecture:** Retain Node/FastAPI/LangGraph, five snapshot tools, two decision rounds/four tools/three requests, existing deadlines, unknown-request handling and human publication approval. Improve the existing model adapter's review instructions, context presentation and explicit Gemini reasoning configuration. No new model, auto-fallback, shell execution, vector infrastructure or repeated judge loop.
**Tech stack:** Existing Python/Pydantic/LangGraph/Gemini adapter and pytest; existing exact-run evaluator.
**Spec:** `docs/superpowers/specs/2026-11-18-bounded-python-review-agent-design.md`, especially sections 5, 6 and 9. The user's 18 November follow-up authorizes researching and implementing review-quality fixes and bounded live verification.

## Diagnosis and references

Observed live output misclassified `!isDraft || !reviewsPaused` as correct despite the related test. The adapter did not configure thinking; Google's documentation lists this model's default as minimal. A denied request for source lines 1–20 when only 1–2 exist also wasted one tool. These are separate model-reasoning and tool-guidance issues; neither proves lack of a vector database or need for a paid replacement.

- Google thinking configuration: https://aistudio.google.com/docs/thinking (explicit supported effort; hidden reasoning never logged).
- Google model scope: https://aistudio.google.com/docs/models/gemini-3.1-flash-lite (lightweight/low-latency model positioning).
- Anthropic, Building effective agents: https://www.anthropic.com/research/building-effective-agents (start with small composable changes, clear tool interfaces).
- CR-Bench: https://arxiv.org/abs/2603.11078 (recall versus noisy false positives; more reflexion is not automatically better, especially on smaller models).

## Constraints and review focus

- Existing uncommitted feature branch is the working source; preserve all previous work and user artifacts. No new checkout, commit, push or deployment.
- Keep the current privately configured Gemini model; bounded live evaluations only, no load testing. Baseline four cases, revised eight cases, then one Node/HTTP smoke if useful. Stop on uncertain service outcomes rather than blind replay.
- Expected labels/scripted outputs must never enter live model context. Freeze and hash datasets; preserve all failures, not only successful samples. Judge concrete trigger/consequence and unsupported findings separately.
- Do not make blank findings equivalent to proof of correctness. Denied/out-of-range tools remain denied, evidence quotes remain exact, missing context requires abstention.
- Prompt instructions are not deterministic quality tests. Verify actual provider request configuration with intercepted real SDK transport; judge real inference separately.

## Tasks

### 1. Freeze baseline and held-out regression cases

- [x] Save an unmodified four-case live baseline through the existing evaluator and original adapter.
- [x] Freeze separate owned cases covering a non-policy bug, correct counterpart, boundary bug and correct counterpart before their first inference; do not put expected answers into runtime prompts. Clarified the null/object input contract before inference to avoid treating undefined as a clean case.

### 2. Repair the model adapter (TDD)

Files: `agent-service/app/review/llm_client.py`, focused `prompts.py`, `config.py`; tests `test_model.py` and new request-context tests.

- [x] Write failing tests at the real SDK request boundary: final review uses configured effort, planner uses low; thoughts remain disabled; invalid reasoning setting fails before any request; selected source windows retain exact numbered lines and source IDs on the wire.
- [x] Add a short review rubric: investigate changed behavior, requirements/test contradictions, input boundaries, auth/state/order failures; produce a concrete counterexample and consequence for each supported finding. Challenge each candidate, allow empty results, avoid broad correctness assurances. Exact single-line quotes and old/new coordinates stay required.
- [x] Make read-window bounds and related-test retrieval explicit. Never silently widen source access or clip model-selected ranges.
- [x] Stage-aware thinking for supported Gemini 3 models only; initial high default was tested, final server-owned `PRISM_AGENT_THINKING_LEVEL=medium` default chosen after speculative high-effort findings; provider-default opt-out for compatibility. No hidden traces or arbitrary client budget settings.
- [x] Run Python suite and Ruff; then revised live evaluation on unchanged four cases and separately frozen additional cases. No substring-only prompt tests. Added failing tests for shared output caps, explicit truncation/no-replay and generation-schema walkthrough membership after live results exposed them.

### 3. Judge, integrate and document

- [x] Preserve all run IDs, dataset hashes, model IDs, usage, latency, stop reasons and unavailable cases. Produce explicit engineering adjudication, distinct from independent human labels. No automatically invented precision/recall.
- [x] Report model variability and the remaining uncertain provider result; offer a separately budgeted stronger-model comparison rather than silently buying a different model.
- [x] Run Node private-boundary tests plus a real Node→FastAPI→provider smoke. Update guide/FEATURE_ROADMAP with measured results and deployment limits. Local preview remains explicitly scripted unless a live report is actually served.
- [x] One fresh read-only quality-change review, supported-prefix regression fixed RED→GREEN; later live-discovered output/schema fixes separately covered by failing SDK/graph tests. No full unrelated branch review loop or commit.

## Completion evidence and limits

See `docs/REVIEW_QUALITY.md` and `tmp/agent-implementation/quality-run-summary.json`. Full local script: Python40/Ruff, backend187+2optional skips, frontend66, scorer7, client build. Python image rebuilt/imported with network disabled. Final Node/real FastAPI/Gemini smoke completed with one supported policy bug and validated review,12,259ms/4,101tokens. Additional medium-effort null/expiry cases found both defects and no findings on their two correct counterparts.

The policy evaluation batch still includes an uncertain case; no automatic replay or perfect-quality claim. Evaluation retained all failed trials; independent human precision/recall remain unknown. Deferred minor: numbered blank-line-heavy context can increase input-token overhead. No push/deployment or activation of the new engine in Azure.
