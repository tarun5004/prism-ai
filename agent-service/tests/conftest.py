import copy
import json
from pathlib import Path

import pytest


@pytest.fixture
def request_data():
    path = Path(__file__).resolve().parents[2] / "docs/contracts/prism-agent-v1/request.json"
    return copy.deepcopy(json.loads(path.read_text(encoding="utf-8")))
