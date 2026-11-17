import { CheckCircle2, LoaderCircle } from 'lucide-react';

export default function AnalysisProgress({ stage = 'connecting', elapsedSeconds = 0, visitedStages = [] }) {
  const stages = [
    {
      id: 'fetching',
      label: 'Reading PR changes',
      message: 'Fetching the pull request and its changed files.',
    },
    {
      id: 'context',
      label: 'Building review context',
      message: 'Your context is being read. Please wait while relevant code is collected.',
    },
    {
      id: 'reviewing',
      label: 'Reviewing with AI',
      message: 'AI is reviewing the prepared context for potential bugs and impact.',
    },
    { id: 'saving', label: 'Saving your report', message: 'Saving validated findings and code changes.' },
  ];
  const active = stages.findIndex((item) => item.id === stage);
  const current = stages[active] || {
    label: 'Connecting to PRism',
    message: 'Waiting for your review request to begin.',
  };
  return (
    <section className="analysis-progress" aria-labelledby="progress-title">
      <div className="progress-heading">
        <div role="status" aria-live="polite">
          <LoaderCircle className="spin" size={19} aria-hidden="true" />
          <div>
            <h3 id="progress-title">{current.label}</h3>
            <p>{current.message}</p>
          </div>
        </div>
        <span className="elapsed-time">{elapsedSeconds}s elapsed</span>
      </div>
      <ol className="progress-stages" aria-label="Analysis stages">
        {stages.map((item, index) => {
          const state =
            active < 0 || index > active
              ? 'pending'
              : index === active
                ? 'active'
                : visitedStages.includes(item.id)
                  ? 'complete'
                  : 'skipped';
          return (
            <li key={item.id} data-state={state} aria-current={state === 'active' ? 'step' : undefined}>
              {state === 'complete' ? (
                <CheckCircle2 size={16} aria-hidden="true" />
              ) : state === 'active' ? (
                <LoaderCircle className="spin" size={16} aria-hidden="true" />
              ) : (
                <span className="step-number" aria-hidden="true">
                  {state === 'skipped' ? '–' : index + 1}
                </span>
              )}
              <span>
                {item.label}
                {state === 'skipped' ? ' · skipped' : ''}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="progress-note">
        Response time varies with PR size and AI availability. Your report will appear when it is ready.
      </p>
    </section>
  );
}
