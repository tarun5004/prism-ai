import os
import json
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Settings:
    service_token: str = field(default="", repr=False)
    api_key: str = field(default="", repr=False)
    model: str = ""
    thinking_level: str = "medium"
    deadline_seconds: float = 90
    attempt_seconds: float = 30
    max_requests: int = 3
    max_rounds: int = 2
    max_tools: int = 4
    prices: dict | None = None

    def __post_init__(self):
        if self.thinking_level not in {"minimal", "low", "medium", "high", "provider"}:
            raise ValueError("Unsupported agent thinking level")

    @classmethod
    def from_env(cls):
        try:
            prices = json.loads(os.getenv("PRISM_AGENT_PRICES_JSON", "null"))
        except ValueError:
            prices = None
        return cls(
            service_token=os.getenv("PRISM_AGENT_SERVICE_TOKEN", "").strip(),
            api_key=os.getenv("GEMINI_API_KEY", "").strip(),
            model=os.getenv("PRISM_AGENT_MODEL", "").strip(),
            thinking_level=os.getenv("PRISM_AGENT_THINKING_LEVEL", "medium").strip().lower(),
            prices=prices,
        )
