import copy

from app.review.schemas import AgentRequest
from app.review.validation import validate_output
from test_graph import output


def test_deleted_line_evidence_uses_old_coordinates_in_incremental_review(request_data):
    request_data["scope"]["diffBaseSha"] = "3" * 40
    request_data["files"][0]["lines"][0].update(lineSide="old", change="deleted")
    request = AgentRequest.model_validate(request_data)
    final = output()
    final["findings"][0]["lineSide"] = "old"
    final["review"]["walkthrough"][0]["evidenceRefs"][0]["lineSide"] = "old"
    findings, review, error = validate_output(final, request, [])
    assert len(findings) == 1 and review and error is None
    foreign = copy.deepcopy(final)
    foreign["findings"][0]["lineSide"] = "new"
    assert validate_output(foreign, request, [])[0] == []
