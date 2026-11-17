export const workflows = {
  gitlab: {
    label: 'GitLab CI',
    path: '.gitlab-ci.yml',
    note: 'Configured checks · hosted execution depends on runner verification and quota',
    stages: [
      {
        name: 'Push to GitLab',
        artifact: 'A branch or merge-request pipeline for the separately pushed commit.',
        gate: 'No GitLab push, an excluded branch rule, or hosted runner account verification.',
        text: 'GitHub is the primary repository. A separate push to the GitLab remote triggers branch or merge-request rules; duplicate branch/MR runs are avoided.',
      },
      {
        name: 'Run verification',
        artifact: 'Test results for JavaScript, Python and the MongoDB/Azurite job boundary.',
        gate: 'A failed check or unavailable runner. Model output is isolated from these checks.',
        text: 'JavaScript backend/frontend tests, Python evaluation checks, and a MongoDB + Azurite queue integration job run without live model requests.',
      },
      {
        name: 'Build the client',
        artifact:
          'A client/dist build; JUnit reports and configured build artifacts expire after seven days.',
        gate: 'Earlier test jobs or the Vite build fail.',
        text: 'The build stage follows successful test jobs. JUnit XML and client/dist artifacts are configured with a seven-day expiry.',
      },
      {
        name: 'Inspect the artifacts',
        artifact: 'Downloadable configured artifacts and job logs for the reviewed commit.',
        gate: 'An unstarted pipeline or expired artifact. Failed jobs may still retain logs and JUnit reports; this path has no Azure deploy job.',
        text: 'Review failures and download build artifacts in GitLab. This workflow has no Azure deployment job; runner verification can still prevent it from starting.',
      },
    ],
  },
  github: {
    label: 'GitHub Actions',
    path: '.github/workflows/checks.yml',
    note: 'Configured verify → integration → container → manually gated deployment',
    stages: [
      {
        name: 'Verify the change',
        artifact:
          'Node/Python verification, a client build and a separate durable-job integration check.',
        gate: 'A failing test, build or integration job blocks the downstream image check.',
        text: 'Pushes and pull requests run Node tests, Python checks and the frontend build. MongoDB/Azurite integration verifies the durable job boundary separately.',
      },
      {
        name: 'Smoke-test Docker',
        artifact:
          'An image checked for health, frontend delivery and the recorded review endpoint.',
        gate: 'Image build or smoke-test failure. No live Gemini call is needed.',
        text: 'After verification and integration pass, build the image and check health, the read-only recorded report and frontend. These smoke tests do not call Gemini.',
      },
      {
        name: 'Manual deployment gate',
        artifact: 'An explicitly requested deployment path for integration/v0-demo.',
        gate: 'Missing deploy input, wrong branch, or missing environment/Azure identity configuration.',
        text: 'Deployment requires an explicit workflow-dispatch deploy input on integration/v0-demo. It also requires configured production environment and Azure identity settings.',
      },
      {
        name: 'Update both services',
        artifact: 'The same commit-tagged GHCR image selected for HTTP API and worker.',
        gate: 'Registry publication, Azure OIDC authentication or service update failure.',
        text: 'The gated path publishes the commit-tagged image to GHCR and uses Azure OIDC to update the existing HTTP app and worker to that same image.',
      },
    ],
  },
};
