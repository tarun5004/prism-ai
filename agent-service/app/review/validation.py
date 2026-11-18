"""Check returned evidence against supplied code; schema validity is not bug truth."""
from pydantic import ValidationError

from app.review.schemas import Finding, Review


def valid_reference(reference, request, sources, changed_only=False):
    for file in request.files:
        if file.filePath != reference.filePath:
            continue
        for line in file.lines:
            if (line.lineNumber == reference.lineNumber and line.lineSide == reference.lineSide
                    and (not changed_only or line.change in {"added", "deleted"})):
                return bool(reference.evidence.strip()) and line.code.strip() == reference.evidence.strip()
    if not changed_only:
        for source in sources:
            if source["filePath"] == reference.filePath and source["lineSide"] == reference.lineSide:
                index = reference.lineNumber - source["startLine"]
                lines = source["code"].split("\n")
                if 0 <= index < len(lines):
                    return bool(reference.evidence.strip()) and lines[index].strip() == reference.evidence.strip()
    return False


def validate_output(output, request, selected_sources):
    if not isinstance(output, dict) or set(output) != {"findings", "review"}:
        return [], None, "INVALID_RESPONSE"
    raw_findings = output["findings"]
    if not isinstance(raw_findings, list) or len(raw_findings) > 5:
        return [], None, "INVALID_FINDINGS"
    findings = []
    for raw in raw_findings:
        try:
            finding = Finding.model_validate(raw)
            if valid_reference(finding, request, [], changed_only=True):
                findings.append(finding.model_dump())
        except ValidationError:
            continue
    rejected = len(raw_findings) != len(findings)
    if raw_findings and not findings:
        return [], None, "INVALID_FINDINGS"
    try:
        review = Review.model_validate(output["review"])
        items = [*review.walkthrough, *review.impacts]
        if any(not valid_reference(ref, request, selected_sources) for item in items for ref in item.evidenceRefs):
            raise ValueError("Unsupported evidence")
        paths = {file.filePath for file in request.files}
        if {item.filePath for item in review.walkthrough} != paths:
            raise ValueError("Incomplete walkthrough")
        if any(not any(ref.filePath == item.filePath for ref in item.evidenceRefs) for item in review.walkthrough):
            raise ValueError("Walkthrough reference mismatch")
        if any(not item.strip() or len(item) > 500 for item in review.limitations):
            raise ValueError("Invalid limitation")
    except (ValidationError, ValueError):
        return findings, None, "INVALID_REVIEW"
    return findings, review.model_dump(), "INVALID_FINDINGS" if rejected else None
