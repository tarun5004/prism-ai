import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const vite = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true }, appType: 'custom' });
after(() => vite.close());
const activity = await vite.ssrLoadModule('/src/features/dashboard/report/AgentActivity.jsx');
const approval = await vite.ssrLoadModule('/src/features/dashboard/report/ReviewApproval.jsx');
const statusPanel = await vite.ssrLoadModule('/src/features/dashboard/report/AiStatusPanel.jsx');

test('agent activity shows tool metadata, unknown metrics and honest provenance', () => {
  const html = renderToStaticMarkup(createElement(activity.default, { agent: { provenance: 'scripted-fixture', stopReason: 'round_budget', rounds: 2, toolCalls: 1, attempts: 3,
    usage: { totalTokens: null }, events: [{ tool: 'find_related_tests', status: 'ok', durationMs: 2,
      sources: [{ sourceId: 'source-1', filePath: 'test/policy.test.js', lineSide: 'new', startLine: 1, endLine: 2, revision: 'a'.repeat(40) }] }] } }));
  assert.match(html, /Scripted fixture/); assert.match(html, /Find related tests/); assert.match(html, /test\/policy.test.js/);
  assert.match(html, /unknown/); assert.match(html, /Tests were not executed/); assert.doesNotMatch(html, /Live provider/);
});

test('scripted graph output never claims a live model response in the status panel', () => {
  const html = renderToStaticMarkup(createElement(statusPanel.default, { files: [], analysis: {
    aiStatus: 'completed', aiDiagnostics: { agent: { provenance: 'scripted-fixture' } } } }));
  assert.match(html, /Scripted agent fixture/);
  assert.doesNotMatch(html, /The model returned a validated response/);
});

test('malformed or absent optional agent metadata cannot break older reports', () => {
  for (const agent of [undefined, null, {}, { events: [null, { sources: 'bad', tool: {} }], usage: { totalTokens: {} }, stopReason: {} }]) {
    assert.doesNotThrow(() => renderToStaticMarkup(createElement(activity.default, { agent })));
  }
});

test('approval displays the fixed preview and requires a human action', () => {
  const html = renderToStaticMarkup(createElement(approval.default, { analysis: { id: 'agent-1', publication: { status: 'pending', preview: '<!-- marker -->\nA fixed advisory summary.' } } }));
  assert.match(html, /Approve summary/); assert.match(html, /Reject/); assert.match(html, /A fixed advisory summary/);
  assert.doesNotMatch(html, /&lt;!-- marker/);
  for (const status of ['published', 'rejected', 'unknown', 'publishing']) {
    const saved = renderToStaticMarkup(createElement(approval.default, { analysis: { id: 'agent-1', publication: { status, preview: 'Preview' } } }));
    assert.doesNotMatch(saved, />Approve summary</);
    if (['unknown', 'publishing'].includes(status)) assert.match(saved, /Check GitHub status/);
  }
});
