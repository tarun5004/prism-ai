import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const vite = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
after(() => vite.close());
const landing = await vite.ssrLoadModule('/src/features/landing/LandingPage.jsx');
const architecture = await vite.ssrLoadModule('/src/features/landing/RequestArchitecture.jsx');

test('homepage offers all five snapshot tools as accessible controls after context', () => {
  const html = renderToStaticMarkup(createElement(landing.default));
  const section = html.match(/<section id="agent-workflow"[\s\S]*?<\/section>/)?.[0];
  assert.ok(section, 'the homepage must expose the agent explorer');
  assert.ok(html.indexOf('id="context-pipeline"') < html.indexOf('id="agent-workflow"'));
  assert.ok(html.indexOf('id="agent-workflow"') < html.indexOf('id="features"'));
  for (const name of ['Inspect PR snapshot', 'Read source window', 'Find related tests', 'Search review context', 'Run review rules']) {
    assert.match(section, new RegExp(`<button[^>]*type="button"[^>]*aria-controls="agent-tool-detail"[^>]*>[\\s\\S]*?${name}`));
  }
  assert.equal((section.match(/aria-pressed="true"/g) || []).length, 1);
  assert.equal((section.match(/aria-pressed="false"/g) || []).length, 4);
  assert.match(section, /id="agent-tool-detail"[^>]*aria-live="polite"/);
  assert.match(section, /Illustrative/);
});

test('request controls include the private Python step before inference with a matching range and count', () => {
  const html = renderToStaticMarkup(createElement(architecture.default));
  assert.match(html, /Private Python agent/);
  assert.ok(html.indexOf('Private Python agent') < html.indexOf('Gemini inference'));
  assert.match(html, /CHECKPOINT 01 \/ 09/);
  assert.match(html, /id="request-progress"[^>]*max="8"/);
  assert.equal((html.match(/class="request-platform"/g) || []).length, 9);
});
