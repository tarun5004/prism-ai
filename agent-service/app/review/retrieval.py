"""Small deterministic retriever over the current request, never a whole-repo index."""
import re


def rank_sources(sources, query: str, k: int):
    terms = set(re.findall(r"[a-z_][a-z0-9_]{2,}", query.lower()))
    ranked = []
    for index, source in enumerate(sources):
        path, text = source.filePath.lower(), source.code.lower()
        score = sum(3 * (term in path) + (term in text) for term in terms)
        if score:
            ranked.append((score, index, source))
    return [source for _, _, source in sorted(ranked, key=lambda item: (-item[0], item[1]))[:k]]
