import secrets
import json
import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from app.review.schemas import AgentRequest

logger = logging.getLogger("prism.agent")


def create_review_router(settings, model=None):
    router = APIRouter()

    @router.post("/v1/reviews")
    async def review(request: Request):
        if len(settings.service_token) < 32:
            return JSONResponse({"errorCode": "SERVICE_UNAVAILABLE"}, status_code=503)
        supplied = request.headers.get("authorization", "")
        if not secrets.compare_digest(supplied.encode(), ("Bearer " + settings.service_token).encode()):
            return JSONResponse({"errorCode": "UNAUTHORIZED"}, status_code=401)
        if request.headers.get("content-encoding", "identity") != "identity":
            return JSONResponse({"errorCode": "UNSUPPORTED_ENCODING"}, status_code=415)
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 256 * 1024:
                return JSONResponse({"errorCode": "BODY_TOO_LARGE"}, status_code=413)
        try:
            snapshot = AgentRequest.model_validate_json(bytes(body))
        except (ValidationError, ValueError):
            return JSONResponse({"errorCode": "INVALID_REQUEST"}, status_code=422)
        if model is None and not (settings.api_key and settings.model):
            return JSONResponse({"errorCode": "MODEL_UNAVAILABLE"}, status_code=503)
        from app.review.workflow import run_review
        from app.review.llm_client import GeminiModel, ModelUncertain

        try:
            result = await run_in_threadpool(run_review, snapshot, model or GeminiModel(settings), settings)
            diagnostics = result["diagnostics"]
            logger.info(json.dumps({"event": "agent_review", "reviewId": snapshot.reviewId, "status": result["status"],
                "provenance": diagnostics["provenance"], "attempts": diagnostics["attempts"],
                "toolCalls": diagnostics["toolCalls"], "durationMs": diagnostics["durationMs"],
                "stopReason": diagnostics["stopReason"], "usage": diagnostics["usage"], "cost": diagnostics["cost"]}))
            return JSONResponse(result)
        except ModelUncertain:
            logger.warning(json.dumps({"event": "agent_review", "reviewId": snapshot.reviewId, "status": "unknown",
                                       "errorCode": "MODEL_REQUEST_UNCERTAIN"}))
            return JSONResponse({"errorCode": "MODEL_REQUEST_UNCERTAIN"}, status_code=504)
        except Exception:
            return JSONResponse({"errorCode": "REVIEW_UNAVAILABLE"}, status_code=503)

    return router
