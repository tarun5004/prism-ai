"""The only module allowed to call a provider. Never retain raw messages."""
import json
from dataclasses import dataclass

from app.review.schemas import AgentDecision, ModelOutput
from app.review.prompts import SYSTEM, TOOLS_HELP, FINAL_HELP


class ModelRejected(Exception):
    def __init__(self, status, retry_after=0.25):
        super().__init__("Provider rejected the request")
        self.status = status
        self.retry_after = retry_after


class ModelUncertain(Exception):
    def __init__(self):
        super().__init__("Model request outcome is uncertain")


@dataclass
class ModelReply:
    value: object
    usage: dict | None
    finish_reason: str | None = None


def numbered_source(source):
    """Keep source identity/revision, make quote coordinates explicit, avoid duplicate text."""
    return {key: value for key, value in source.items() if key != "code"} | {
        "lines": [{"lineNumber": source["startLine"] + index, "code": code}
                  for index, code in enumerate(source["code"].split("\n"))]}


class GeminiModel:
    provenance = "live-provider"

    def __init__(self, settings):
        self.settings = settings

    @property
    def review_thinking_level(self):
        model = self.settings.model.removeprefix("models/")
        return self.settings.thinking_level if model.startswith("gemini-3") else "provider"

    def _invoke(self, schema, instruction, content, timeout, max_tokens):
        from langchain_google_genai import ChatGoogleGenerativeAI
        from langsmith import tracing_context

        reasoning = {}
        if self.review_thinking_level != "provider":
            reasoning["thinking_level"] = "low" if schema is AgentDecision else self.settings.thinking_level
        chat = ChatGoogleGenerativeAI(
            api_key=self.settings.api_key, model=self.settings.model, vertexai=False,
            max_retries=0, timeout=timeout, max_output_tokens=max_tokens, include_thoughts=False,
            verbose=False, callbacks=[], **reasoning,
        )
        usage = {key: None for key in ["inputTokens", "outputTokens", "thinkingTokens", "totalTokens"]}
        models = chat.client.models
        generate = models.generate_content

        def capture_usage(*args, **kwargs):
            # Capture public SDK counters BEFORE LangChain fills absent values with zero.
            response = generate(*args, **kwargs)
            metadata = response.usage_metadata
            for key, field in {"inputTokens": "prompt_token_count", "outputTokens": "candidates_token_count",
                               "thinkingTokens": "thoughts_token_count", "totalTokens": "total_token_count"}.items():
                value = getattr(metadata, field, None)
                usage[key] = value if type(value) is int and value >= 0 else None
            return response

        # The client is private to this single invocation; never patch global SDK state.
        models.generate_content = capture_usage
        response_schema = schema.model_json_schema()
        if schema is ModelOutput:
            # Context/test sources may be cited, but cannot masquerade as changed files.
            response_schema["$defs"]["WalkthroughItem"]["properties"]["filePath"]["enum"] = [
                file["filePath"] for file in content["files"]]
        try:
            with tracing_context(enabled=False):
                result = chat.with_structured_output(
                    response_schema, method="json_schema", include_raw=True,
                ).invoke([("system", SYSTEM + " " + instruction),
                          ("human", json.dumps(content, ensure_ascii=False))], config={"callbacks": []})
        except Exception as error:
            # LangChain classifies 4xx errors and retains the SDK error as its cause.
            # Inspect structured status only; never parse/log private error messages.
            status, response = None, None
            for _ in range(3):
                status = getattr(error, "status_code", None) or getattr(error, "code", None)
                response = getattr(error, "response", None)
                status = status if type(status) is int else getattr(response, "status_code", None)
                if type(status) is int or error.__cause__ is None:
                    break
                error = error.__cause__
            if type(status) is int and 400 <= status < 500:
                retry_after = 0.25
                try:
                    retry_after = min(30, max(0, float(response.headers.get("retry-after", "0.25"))))
                except (AttributeError, ValueError, TypeError):
                    pass
                raise ModelRejected(status, retry_after) from None
            raise ModelUncertain() from None
        finally:
            chat.client.close()
        raw = result.get("raw")
        finish = str((getattr(raw, "response_metadata", None) or {}).get("finish_reason", "")).upper()
        value = result.get("parsed") if finish == "STOP" and not result.get("parsing_error") else None
        return ModelReply(value, usage, finish if finish in {"STOP", "MAX_TOKENS", "SAFETY"} else "OTHER")

    def decide(self, request, observations, *, timeout):
        manifest = [s.model_dump(exclude={"code"}) | {"endLine": s.startLine + len(s.code.split("\n")) - 1}
                    for s in request.sources]
        notes = [item | {"selectedContext": [numbered_source(source) for source in item["selectedContext"]]}
                 if "selectedContext" in item else item for item in observations]
        content = {"intent": request.intent.model_dump(), "files": [f.model_dump() for f in request.files],
                   "availableSources": manifest, "observations": notes, "memory": request.memory}
        return self._invoke(AgentDecision, TOOLS_HELP, content, timeout, 2048)

    def draft(self, request, selected, observations, *, timeout):
        content = {"intent": request.intent.model_dump(), "files": [f.model_dump() for f in request.files],
                   "context": [numbered_source(source) for source in selected],
                   "observations": observations, "coverage": request.coverage,
                   "memory": request.memory}
        # Gemini shares this allowance between hidden reasoning and visible JSON.
        return self._invoke(ModelOutput, FINAL_HELP, content, timeout, 8192)
