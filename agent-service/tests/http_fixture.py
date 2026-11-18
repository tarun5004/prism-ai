"""Explicit local-only HTTP fixture. Not copied into the deployment image."""
import json
from pathlib import Path

from app.config import Settings
from app.main import create_app
from evaluations.run import FixtureModel

case = json.loads((Path(__file__).resolve().parents[2] / "docs/beta/agent-evaluation-cases.json").read_text())["cases"][0]
app = create_app(Settings(service_token="local-fixture-service-token-not-secret", model="scripted-fixture"),
                 FixtureModel(case["scriptedOutput"]))
