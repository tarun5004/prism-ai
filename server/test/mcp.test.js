import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { createReportServer } from '../scripts/mcp.js';

test('demo MCP exposes only the captured sample over a real stdio connection without MongoDB', async () => {
  const client = new Client({ name: 'demo-check', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL('../scripts/mcp.js', import.meta.url))],
    env: { ...process.env, DEMO_ONLY: 'true', MONGODB_URI: 'mongodb://127.0.0.1:1/not-used' }, stderr: 'pipe' });
  try {
    await client.connect(transport);
    assert.deepEqual((await client.listTools()).tools.map(tool => tool.name), ['read_demo_report']);
    const result = await client.callTool({ name: 'read_demo_report', arguments: {} });
    assert.equal(result.isError, undefined);
    const { report } = JSON.parse(result.content[0].text);
    assert.equal(report.id, 'demo-b01');
    assert.equal(report.sample.readOnly, true);
    assert.equal(report.sample.fixtureId, 'B01');
    assert.ok(report.findings.length > 0);
    assert.equal((await client.callTool({ name: 'list_reports', arguments: {} })).isError, true);
  } finally { await client.close(); await transport.close(); }
});

test('MCP client discovers read-only tools and cannot read outside its explicit scope', async () => {
  const reports = [{ id: 'local-report', status: 'completed', pullRequest: { title: 'Demo' }, findings: [] }, { id: 'private-report', installationId: 9, pullRequest: {}, findings: [] }];
  const server = createReportServer({ list: async () => reports, find: async id => reports.find(report => report.id === id) });
  const client = new Client({ name: 'offline-check', version: '1' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    assert.deepEqual((await client.listTools()).tools.map(tool => tool.name).sort(), ['list_reports', 'read_report']);
    const result = await client.callTool({ name: 'list_reports', arguments: {} });
    assert.ok(result.content[0].text.includes('local-report'));
    assert.ok(!result.content[0].text.includes('private-report'));
    assert.equal((await client.callTool({ name: 'read_report', arguments: { id: 'private-report' } })).isError, true);
    assert.equal((await client.callTool({ name: 'read_report', arguments: { id: '../bad' } })).isError, true);
    assert.equal((await client.callTool({ name: 'read_report', arguments: { id: 'missing' } })).isError, true);
  } finally { await client.close(); await server.close(); }
});
