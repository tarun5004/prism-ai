"""Five read-only functions. Request-local IDs are the entire access boundary."""
from app.review.retrieval import rank_sources


def inspect_pr_snapshot(request):
    return {"status": "ok", "intent": request.intent.model_dump(), "files": [f.filePath for f in request.files]}


def read_source_window(request, sourceId, startLine, endLine):
    source = next((s for s in request.sources if s.sourceId == sourceId), None)
    if not source or not all(type(n) is int for n in [startLine, endLine]):
        raise ValueError("Unknown source")
    lines = source.code.split("\n")
    if not source.startLine <= startLine <= endLine < source.startLine + len(lines) or endLine - startLine >= 60:
        raise ValueError("Out of approved range")
    text = "\n".join(lines[startLine - source.startLine:endLine - source.startLine + 1])
    if len(text) > 2500:
        raise ValueError("Source window too large")
    selected = source.model_copy(update={"startLine": startLine, "code": text})
    return {"status": "ok", "sources": [selected.model_dump()]}


def find_related_tests(request, filePath):
    if filePath not in {file.filePath for file in request.files}:
        raise ValueError("Unknown changed file")
    sources = [s.model_dump() for s in request.sources if s.role == "related-test" and filePath in s.relatedTo]
    return {"status": "ok" if sources else "no_match", "sources": sources[:4], "executed": False}


def search_review_context(request, query, k=4):
    if not isinstance(query, str) or not 0 < len(query.strip()) <= 300 or type(k) is not int or not 1 <= k <= 4:
        raise ValueError("Invalid search")
    sources = [s.model_dump() for s in rank_sources(request.sources, query, k)]
    return {"status": "ok" if sources else "no_match", "sources": sources}


def run_review_rules(request, filePath=None):
    if filePath is not None and filePath not in {file.filePath for file in request.files}:
        raise ValueError("Unknown changed file")
    signals = [r.model_dump() for r in request.rules if filePath is None or filePath in r.affectedFiles]
    return {"status": "ok" if signals else "no_match", "signals": signals, "advisory": True}


TOOLS = {
    "inspect_pr_snapshot": inspect_pr_snapshot,
    "read_source_window": read_source_window,
    "find_related_tests": find_related_tests,
    "search_review_context": search_review_context,
    "run_review_rules": run_review_rules,
}


def execute_tool(request, name, arguments):
    tool = TOOLS.get(name)
    if tool is None or not isinstance(arguments, dict):
        return {"status": "denied"}
    try:
        return tool(request, **arguments)
    except (TypeError, ValueError):
        # No private exception text or model-supplied arguments in output/logs.
        return {"status": "denied"}
