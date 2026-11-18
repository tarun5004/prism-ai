"""CamelCase wire fields match the existing Node report/evidence format."""
import json
import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

SHA = r"^[a-f0-9]{40}$"
SENSITIVE_PATH = re.compile(r"(^|/)(\.env(?:\.[^/]*)?|[^/]*(secret|credential|private[-_]?key)[^/]*)(/|$)|\.(pem|key)$", re.I)
SECRET_TEXT = re.compile(r"-----BEGIN [\w ]*PRIVATE KEY-----|gh[pousr]_[\w]{20,}|github_pat_[\w]{20,}|AIza[\w-]{20,}|(?:AKIA|ASIA)[A-Z0-9]{16}|[a-z][\w+.-]*://[^\s/:@]+:[^\s/@]+@")


def json_size(value) -> int:
    # JS String.length counts UTF-16 units; use the same unit as prepareAiInput.
    return len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-16-le")) // 2


def safe_path(value: str) -> str:
    if (not value or len(value) > 500 or value.startswith("/") or "\\" in value
            or any(p in {"", ".", ".."} for p in value.split("/"))
            or ":" in value or re.search(r"[\x00-\x1f\x7f]", value) or SENSITIVE_PATH.search(value)):
        raise ValueError("Source path is not allowed")
    return value


class WireModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Scope(WireModel):
    installationId: int = Field(ge=1)
    repository: str = Field(pattern=r"^[a-z0-9-]+/[a-z0-9_.-]+$", max_length=200)
    number: int = Field(ge=1)
    baseSha: str = Field(pattern=SHA)
    headSha: str = Field(pattern=SHA)
    diffBaseSha: str | None = Field(default=None, pattern=SHA)


class Guideline(WireModel):
    path: str = Field(max_length=200)
    instructions: str = Field(max_length=500)


class Intent(WireModel):
    title: str = Field(default="", max_length=200)
    description: str = Field(default="", max_length=2000)
    repositoryGuidelines: list[Guideline] = Field(default_factory=list, max_length=10)


class DiffLine(WireModel):
    lineNumber: int = Field(ge=1)
    lineSide: Literal["old", "new"] = "new"
    change: Literal["added", "deleted", "context"]
    code: str = Field(max_length=4000)

    @model_validator(mode="after")
    def check_side(self):
        if (self.change == "deleted" and self.lineSide != "old") or (self.change == "added" and self.lineSide != "new"):
            raise ValueError("Changed-line side mismatch")
        return self


class DiffFile(WireModel):
    filePath: str
    lines: list[DiffLine] = Field(min_length=1, max_length=1000)
    _path = field_validator("filePath")(safe_path)

    @model_validator(mode="after")
    def unique_lines(self):
        keys = [(line.lineSide, line.lineNumber) for line in self.lines]
        if len(set(keys)) != len(keys):
            raise ValueError("Duplicate line coordinates")
        return self


class Source(WireModel):
    sourceId: str = Field(pattern=r"^source-[0-9]+$", max_length=30)
    filePath: str
    lineSide: Literal["old", "new"]
    startLine: int = Field(ge=1)
    revision: str = Field(pattern=SHA)
    code: str = Field(min_length=1, max_length=2500)
    role: str = Field(max_length=40)
    relatedTo: list[str] = Field(default_factory=list, max_length=5)
    _path = field_validator("filePath")(safe_path)

    @field_validator("relatedTo")
    @classmethod
    def related_paths(cls, values):
        return [safe_path(value) for value in values]


class RuleSignal(WireModel):
    category: str = Field(max_length=80)
    severity: Literal["high", "medium", "low"]
    explanation: str = Field(max_length=1500)
    affectedFiles: list[str] = Field(max_length=100)


class AgentRequest(WireModel):
    schemaVersion: Literal["prism-agent-v1"]
    reviewId: str = Field(pattern=r"^[a-z0-9_-]{1,128}$")
    scope: Scope
    intent: Intent = Field(default_factory=Intent)
    files: list[DiffFile] = Field(min_length=1, max_length=5)
    sources: list[Source] = Field(default_factory=list, max_length=16)
    rules: list[RuleSignal] = Field(default_factory=list, max_length=20)
    coverage: dict[str, Any] = Field(default_factory=dict)
    memory: dict[str, Any] | None = None

    @model_validator(mode="after")
    def validate_snapshot(self):
        files = [file.model_dump(exclude_defaults=True) for file in self.files]
        if len({file.filePath for file in self.files}) != len(self.files):
            raise ValueError("Duplicate file")
        if json_size(files) > 12000 or any(json_size(file) > 4000 for file in files):
            raise ValueError("Diff budget exceeded")
        if len({source.sourceId for source in self.sources}) != len(self.sources):
            raise ValueError("Duplicate source ID")
        context_size = 0
        paths = {file.filePath for file in self.files}
        for source in self.sources:
            revision = self.scope.headSha if source.lineSide == "new" else self.scope.diffBaseSha or self.scope.baseSha
            if source.revision != revision or not set(source.relatedTo).issubset(paths):
                raise ValueError("Source scope mismatch")
            context_size += json_size(source.model_dump(exclude={"sourceId", "revision", "relatedTo"}))
        if context_size > 8000:
            raise ValueError("Context budget exceeded")
        if SECRET_TEXT.search(json.dumps(self.model_dump())):
            raise ValueError("Sensitive content is not accepted")
        return self


class ToolArguments(WireModel):
    sourceId: str | None = None
    filePath: str | None = None
    startLine: int | None = Field(default=None, ge=1)
    endLine: int | None = Field(default=None, ge=1)
    query: str | None = Field(default=None, max_length=300)
    k: int | None = Field(default=None, ge=1, le=4)


class ToolCall(WireModel):
    name: Literal["inspect_pr_snapshot", "read_source_window", "find_related_tests",
                  "search_review_context", "run_review_rules"]
    arguments: ToolArguments


class AgentDecision(WireModel):
    action: Literal["tools", "finish"]
    calls: list[ToolCall] = Field(max_length=2)

    @model_validator(mode="after")
    def check_action(self):
        if (self.action == "tools") != bool(self.calls):
            raise ValueError("Decision/action mismatch")
        return self


class Reference(WireModel):
    filePath: str = Field(min_length=1, max_length=500)
    lineSide: Literal["old", "new"] = "new"
    lineNumber: int = Field(ge=1)
    evidence: str = Field(min_length=1, max_length=4000)


class Finding(Reference):
    title: str = Field(min_length=1, max_length=160)
    severity: Literal["high", "medium", "low"]
    explanation: str = Field(min_length=1, max_length=1500)
    suggestedFix: str = Field(min_length=1, max_length=1500)


class ReviewItem(WireModel):
    description: str = Field(min_length=1, max_length=1200)
    evidenceRefs: list[Reference] = Field(min_length=1, max_length=3)


class WalkthroughItem(ReviewItem):
    filePath: str = Field(min_length=1, max_length=500)


class Review(WireModel):
    summary: str = Field(min_length=1, max_length=1200)
    walkthrough: list[WalkthroughItem] = Field(min_length=1, max_length=5)
    impacts: list[ReviewItem] = Field(max_length=5)
    limitations: list[str] = Field(max_length=6)


class ModelOutput(WireModel):
    findings: list[Finding] = Field(max_length=5)
    review: Review
