import {
  GitPullRequest,
  Cloud,
  Database,
  ListOrdered,
  Cpu,
  Sparkles,
  ShieldCheck,
  Monitor,
} from 'lucide-react';

// An educational success/fallback story, never a live request or resource status.
export const requestJourney = [
  {
    label: 'GitHub event',
    icon: GitPullRequest,
    color: 'coral',
    service: 'External · GitHub',
    title: 'A pull request changes.',
    detail:
      'An eligible webhook sends PR metadata to the public API. The API must wake up and accept the event within GitHub’s delivery deadline.',
    payload: 'pull_request event → signed HTTP body',
    checkpoint: 'Event received',
    output: 'A signed event to verify',
  },
  {
    label: 'Container Apps API',
    icon: Cloud,
    color: 'blue',
    service: 'Azure · HTTP container',
    title: 'Verify first. Accept work deliberately.',
    detail:
      'The API checks the webhook signature and review eligibility. An authenticated manual PR submission can enter the same durable review flow.',
    payload: 'HMAC verification + repository policy',
    checkpoint: 'Signature and eligibility checked',
    output: 'An eligible job for an exact PR revision',
  },
  {
    label: 'Persist job',
    icon: Database,
    color: 'green',
    service: 'External · MongoDB Atlas',
    title: 'Store the job before publishing a message.',
    detail:
      'The durable job stores the review input and state. Only after persistence does the API publish the identifier, so accepted work can be claimed independently of the HTTP request.',
    payload: 'jobId + payload + durable state',
    checkpoint: 'Job persisted',
    output: 'A durable job identifier',
  },
  {
    label: 'Azure Storage Queue',
    icon: ListOrdered,
    color: 'yellow',
    service: 'Azure · Queue storage',
    title: 'Queue an identifier, not the repository.',
    detail:
      'The queue message contains a base64-encoded job ID. Source code and provider credentials are not carried in this message. Queue activity drives the event worker scaler.',
    payload: 'base64(jobId)',
    checkpoint: 'Identifier enqueued',
    output: 'A wake-up signal for the worker',
  },
  {
    label: 'Container Apps Job',
    icon: Cpu,
    color: 'orange',
    service: 'Azure · Event worker',
    title: 'Claim the work and prepare context.',
    detail:
      'A one-shot worker claims a durable job, retrieves pinned PR changes and bounded source context, and prepares the sanitized input. Checkpoints guard the model/save boundary.',
    payload: 'claim → pinned code → bounded input',
    checkpoint: 'Worker owns the job',
    output: 'Diff + relevant source + coverage',
  },
  {
    label: 'Gemini inference',
    icon: Sparkles,
    color: 'lilac',
    service: 'External · Model API',
    title: 'Ask the model within a bounded deadline.',
    detail:
      'The configured model receives the prepared input. Its output is advisory. The report records actual provider status; a failed or timed-out call is not presented as successful AI.',
    payload: 'prepared context → model response',
    checkpoint: 'Model outcome recorded',
    output: 'AI response or an explicit failure status',
  },
  {
    label: 'Save validated report',
    icon: ShieldCheck,
    color: 'green',
    service: 'Worker → MongoDB Atlas',
    title: 'Validate evidence. Preserve the result.',
    detail:
      'Schema and code references are validated before saving. The report keeps its exact revision, diff, coverage and AI status. The worker process exits after its execution finishes.',
    payload: 'validated findings + report + AI status',
    checkpoint: 'Report persisted',
    output: 'A saved report; worker execution ends',
  },
  {
    label: 'Browser fetch',
    icon: Monitor,
    color: 'blue',
    service: 'Browser → HTTP API',
    title: 'Fetch the report and inspect the evidence.',
    detail:
      'The browser polls accepted work, then fetches the saved report through the API with access checks. It does not receive a model callback directly. The HTTP app can later scale down after its idle cooldown.',
    payload: 'authenticated GET → saved report',
    checkpoint: 'Report available to the reviewer',
    output: 'Diff, evidence and an honest review status',
  },
];
