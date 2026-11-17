import { createHash } from 'node:crypto';
import { prepareAiInput } from './ai.context.js';

const hash = text => createHash('sha256').update(text).digest('hex');

// Explicit embeddings avoid Chroma silently downloading or choosing another model.
async function embedCode(texts, taskType) {
  const { GoogleGenAI } = await import('@google/genai');
  if (!process.env.GEMINI_API_KEY?.trim()) throw Error('Embedding configuration required.');
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY.trim(), vertexai: false,
    httpOptions: { timeout: 10000, retryOptions: { attempts: 1 } } });
  const response = await client.models.embedContent({ model: process.env.GEMINI_EMBEDDING_MODEL?.trim() || 'gemini-embedding-001',
    contents: texts, config: { taskType, outputDimensionality: 768 } });
  return response.embeddings?.map(item => item.values);
}

async function chromaClient(signal) {
  const url = new URL(process.env.CHROMA_URL || 'invalid:');
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || !['http:', 'https:'].includes(url.protocol)
    || (url.protocol === 'http:' && !['localhost', '127.0.0.1', 'host.docker.internal'].includes(url.hostname))) throw Error('Private Chroma configuration required.');
  const { ChromaClient } = await import('chromadb');
  return new ChromaClient({ host: url.hostname, port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)), ssl: url.protocol === 'https:',
    fetchOptions: { signal }, ...(process.env.CHROMA_API_KEY ? { headers: { 'x-chroma-token': process.env.CHROMA_API_KEY } } : {}) });
}

// This is a bounded semantic retriever, not a clone/index of the whole repository.
async function retrieveSemanticContext(pullRequest, { installationId, enabled = process.env.REVIEW_RETRIEVAL === 'semantic', client, embed = embedCode } = {}) {
  const original = pullRequest.reviewContext || { snippets: [], omitted: [] };
  if (!enabled) return original;
  let embeddingCalls = 0;
  try {
    if (!/^[\w.-]+\/[\w.-]+$/.test(pullRequest.repository || '') || ![pullRequest.headSha, pullRequest.baseSha].every(sha => /^[a-f\d]{40}$/i.test(sha || ''))
      || (installationId !== undefined && (!Number.isSafeInteger(installationId) || installationId < 1))) throw Error('Revision scope required.');
    const prepared = prepareAiInput(pullRequest);
    const chunks = [];
    for (const snippet of prepared.snippets) {
      const lines = snippet.code.split('\n');
      for (let start = 0; start < lines.length && chunks.length < 16; start += 28) {
        const selected = [];
        for (const line of lines.slice(start, start + 32)) {
          if (selected.join('\n').length + line.length > 1600) break;
          selected.push(line);
        }
        if (selected.length) chunks.push({ ...snippet, startLine: snippet.startLine + start, code: selected.join('\n') });
      }
    }
    if (!chunks.length) return { ...original, semanticRetrieval: { status: 'empty', embeddingCalls } };
    const model = process.env.GEMINI_EMBEDDING_MODEL?.trim() || 'gemini-embedding-001';
    // Different installation/revision/model never shares a collection or vector dimension.
    const scope = hash(JSON.stringify([installationId || 'local', pullRequest.repository.toLowerCase(), pullRequest.baseSha, pullRequest.diffBaseSha || pullRequest.baseSha, pullRequest.headSha, model]));
    const records = new Map(chunks.map(chunk => [hash(scope + JSON.stringify(chunk)), chunk]));
    const store = client || await chromaClient(AbortSignal.timeout(20000));
    const collection = await store.getOrCreateCollection({ name: 'prism-' + scope.slice(0, 36), embeddingFunction: null,
      metadata: { purpose: 'prism-bounded-context' } });
    const ids = [...records.keys()];
    const cached = new Set((await collection.get({ ids, include: [] })).ids);
    const missing = ids.filter(id => !cached.has(id));
    const vectors = async (texts, task) => {
      embeddingCalls++;
      const result = await embed(texts, task);
      if (!Array.isArray(result) || result.length !== texts.length || result.some(vector => !Array.isArray(vector) || !vector.length || vector.length > 4096 || !vector.every(Number.isFinite) || !vector.some(value => value !== 0))) throw Error('Invalid embedding result.');
      return result;
    };
    if (missing.length) await collection.upsert({ ids: missing, documents: missing.map(id => records.get(id).code),
      embeddings: await vectors(missing.map(id => records.get(id).code), 'RETRIEVAL_DOCUMENT'),
      metadatas: missing.map(id => { const chunk = records.get(id); return { filePath: chunk.filePath, lineSide: chunk.lineSide, startLine: chunk.startLine, revision: chunk.lineSide === 'old' ? pullRequest.diffBaseSha || pullRequest.baseSha : pullRequest.headSha }; }) });
    const query = JSON.stringify({ ...prepared.intent, files: prepared.files.map(file => file.filePath) }).slice(0, 1000);
    const result = await collection.query({ queryEmbeddings: await vectors([query], 'RETRIEVAL_QUERY'), nResults: Math.min(4, ids.length), include: [] });
    // Use only current trusted chunks, never unverified text returned by the store.
    const selected = [...new Set(result.ids?.[0] || [])].filter(id => records.has(id)).slice(0, 4).map(id => records.get(id));
    if (!selected.length) throw Error('No relevant current chunks.');
    return { ...original, scope: 'bounded-chroma', snippets: selected,
      semanticRetrieval: { status: 'completed', model, indexedChunks: ids.length, retrievedChunks: selected.length, cacheHit: missing.length === 0, embeddingCalls } };
  } catch {
    return { ...original, semanticRetrieval: { status: 'unavailable', errorCode: 'SEMANTIC_RETRIEVAL_FAILED', embeddingCalls },
      omitted: [...(original.omitted || []), { reason: 'semantic-retrieval-unavailable' }] };
  }
}

export { retrieveSemanticContext };
