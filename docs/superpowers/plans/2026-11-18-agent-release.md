# Bounded agent release and repository cleanup

The owner explicitly requested cleanup, focused commits, an updated README/homepage and deployment. This executes the previously approved Python agent design and existing homepage design; it does not redesign the product or add a new service architecture.

## Release boundary

- Preserve the current feature branch and every existing uncommitted implementation. Back up sources/evidence before cleanup; preserve the user-owned engineering PDF at its current path.
- Remove generated caches and temporary debug/browser scripts from the source checkout after their backup. Ignore local outputs/evidence. Retain meaningful regression tests, frozen datasets, optional legacy features and architectural/history docs.
- Clarify Python names: `workflow.py`, `llm_client.py`; place the offline evaluator outside the runtime review feature and keep runtime metrics in the feature. Preserve existing HTTP/data/security contracts.
- Keep the approved homepage appearance. Extend its context/architecture explanations with the real Python agent, five tools, bounded lexical retrieval, reasoning/validation, approval and limits. No claimed semantic/vector RAG on the agent path; no invented accuracy guarantee.
- Deploy both immutable container images into the existing Azure environment, private HTTPS agent ingress, minimum0/maximum1 replica, existing durable queue/worker/auth and legacy job pinning. No main merge or force push. No new paid service/provider.

## Implementation and commit chunks

1. **Repository hygiene:** backup, generated files, ignore rules; remove only a proven unused client self-dependency. Preserve user artifacts.
2. **Python agent:** service, clear module names, tools/retrieval, schema/evidence checks, reasoning/output reliability, metrics, evaluator/tests/contracts.
3. **Node integration:** private HTTP boundary, durable engine selection/recovery, human publication approval and regressions.
4. **Frontend:** report activity/approval and homepage agent/context/cloud explanations; render/interaction and responsive checks.
5. **Delivery:** private Azure agent template, both-image/manual release workflow and Python CI checks; preserve secrets and existing hosted settings. GitLab runner availability is not assumed.
6. **Documentation:** concise current README, architecture/setup/learning links, honest evidence matrix and cleanup/release ledger.

Run meaningful checks before explicitly staged commits. Independent documentation and Python cleanup may be delegated with disjoint ownership; root owns Git, cleanup, frontend and Azure mutations. Finish with full local verification, image build, scoped review, secret scan, push feature branch, Azure rollout and live health/homepage/actual worker result verification. Do not count health/sample200 as agent inference success.

## Deployment and rollback

Read current cloud names/configuration first. Reuse the existing private parameter file without logging it, create a dedicated random service credential in memory/private local configuration and reuse the selected Gemini key/model. Compile/inspect incremental infrastructure changes before applying. Deploy private agent first, then Node API/worker. Restore prior image/legacy selection if a smoke test shows an app regression; never replay an uncertain model request automatically. Record final URLs, SHAs/digests, cloud status and remaining manual items.

## Progress

- [x] Backed up and cleaned generated files.
- [x] Python naming/runtime boundary and tests verified.
- [x] Agent integration/report UI committed in focused chunks.
- [x] Homepage and README reflect actual agent flow.
- [x] Checks/images/security review complete; source pushed.
- [x] Private agent + API/worker deployed and live flow verified.
