param([switch]$Integration, [switch]$Docker)
$ErrorActionPreference = 'Stop'
function Invoke-Check([string]$Label, [scriptblock]$Run) {
  Write-Host "Checking $Label"
  & $Run
  if ($LASTEXITCODE -ne 0) { throw "$Label failed (exit $LASTEXITCODE)." }
}
$prismRoot = Split-Path $PSScriptRoot -Parent
Push-Location $prismRoot
try {
  Invoke-Check 'Frozen Python dependencies' { uv sync --project agent-service --frozen }
  Invoke-Check 'Python agent' { uv run --project agent-service --frozen pytest agent-service/tests -q }
  Invoke-Check 'Python lint' { uv run --project agent-service --frozen ruff check agent-service/app agent-service/tests agent-service/evaluations }
  Invoke-Check 'Node backend' { npm test --prefix server }
  Invoke-Check 'React contracts and rendering' { node --test client/test/*.test.js }
  Invoke-Check 'Existing evaluation scorer' { uv run --project agent-service --frozen python server/test/evaluation_test.py }
  Invoke-Check 'Client build' { npm run build --prefix client }
  if ($Integration) {
    $priorIntegration = $env:INTEGRATION_TESTS
    try {
      $env:INTEGRATION_TESTS = 'true'
      Invoke-Check 'Real isolated Mongo/Azurite' { node --test --test-name-pattern='durable queue integration|real Mongo persists engine' server/test/webhook.test.js server/test/agent.integration.test.js }
    } finally { $env:INTEGRATION_TESTS = $priorIntegration }
  }
  if ($Docker) {
    Invoke-Check 'Python Docker image' { docker build -t prism-agent:local agent-service }
    Invoke-Check 'Python image imports without network or credentials' { docker run --rm --network none --entrypoint python prism-agent:local -c "from app.main import app; from app.review.workflow import run_review; from app.review.llm_client import GeminiModel; assert app.title == 'Prism private review agent'; assert callable(run_review); assert callable(GeminiModel)" }
    Invoke-Check 'Node Docker image' { docker build -t prism-ai:agent-local . }
  }
} finally { Pop-Location }
