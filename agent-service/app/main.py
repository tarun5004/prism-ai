import logging

from fastapi import FastAPI

from app.config import Settings
from app.review.routes import create_review_router


def create_app(settings: Settings | None = None, model=None) -> FastAPI:
    # No model/network work at import or during a liveness check.
    settings = settings or Settings.from_env()
    api = FastAPI(title="Prism private review agent", docs_url=None, redoc_url=None, openapi_url=None)
    api.include_router(create_review_router(settings, model))

    @api.get("/health")
    def health():
        return {"status": "ok", "service": "prism-agent"}

    return api


agent_logger = logging.getLogger('prism.agent')
agent_logger.setLevel(logging.INFO)
if not agent_logger.handlers:
    agent_logger.addHandler(logging.StreamHandler())

app = create_app()

