"""Shared usage totals and optional dated cost estimates for review diagnostics."""
from datetime import date
import math


def summarize_usage(attempts):
    result = {}
    for key in ["inputTokens", "outputTokens", "thinkingTokens", "totalTokens"]:
        values = [(a.get("usage") or {}).get(key) for a in attempts]
        known = [v for v in values if type(v) is int and v >= 0]
        result[key] = sum(known) if len(known) == len(values) and values else None
        result["known" + key[0].upper() + key[1:]] = sum(known)
    return result


def estimate_cost(attempts, model, rates):
    unknown = {"estimatedUsd": None, "asOf": None, "reason": "complete usage and dated model prices required"}
    if not isinstance(rates, dict) or rates.get("model") != model or not attempts:
        return unknown
    try:
        date.fromisoformat(rates["asOf"])
        prices = [rates["inputUsdPerMillion"], rates["outputUsdPerMillion"]]
        if any(type(value) not in {int, float} or value < 0 or not math.isfinite(value) for value in prices):
            return unknown
        total = 0
        for attempt in attempts:
            usage = attempt.get("usage") or {}
            counters = [usage.get("inputTokens"), usage.get("outputTokens"), usage.get("thinkingTokens")]
            if any(type(value) is not int or value < 0 for value in counters):
                return unknown
            tokens = [counters[0], counters[1] + counters[2]]
            total += sum(value * price / 1_000_000 for value, price in zip(tokens, prices))
        return {"estimatedUsd": round(total, 10), "asOf": rates["asOf"], "reason": "configured token-price estimate; excludes infrastructure"}
    except (KeyError, TypeError, ValueError):
        return unknown

