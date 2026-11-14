import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { Annotation, StateGraph, START, END, MemorySaver } from '@langchain/langgraph';
import { RunTree } from 'langsmith/run_trees';
import { withRunTree } from 'langsmith/traceable';

async function reviewCheckpointer() {
  if (mongoose.connection.readyState !== 1) {
    if (process.env.NODE_ENV === 'production') throw Error('Persistent workflow storage required.');
    return new MemorySaver(); // Local-only runs do not promise recovery across restarts.
  }
  const { MongoDBSaver } = await import('@langchain/langgraph-checkpoint-mongodb');
  const saver = new MongoDBSaver({ client: mongoose.connection.getClient(), dbName: mongoose.connection.name,
    checkpointCollectionName: 'review_checkpoints', checkpointWritesCollectionName: 'review_checkpoint_writes', ttl: 86400 });
  if ((await saver.setup()).length) throw Error('Workflow indexes unavailable.');
  return saver;
}

// Callbacks keep transient source windows and credentials OUT of checkpoint state.
async function runReviewWorkflow({ id, repository, baseSha, headSha, installationId, prepare, review, save, load, checkpointer, resume = false }) {
  if (process.env.LANGCHAIN_VERBOSE === 'true') throw Error('Private workflow logging disabled.');
  const thread = createHash('sha256').update(JSON.stringify(['review-v1', installationId || 'local', repository, baseSha, headSha, id])).digest('hex');
  const state = Annotation.Root({ phase: Annotation(), aiResult: Annotation(), saved: Annotation() });
  let prepared = false; let response;
  const graph = new StateGraph(state)
    .addNode('context', async () => { await prepare(); prepared = true; return { phase: 'prepared' }; })
    .addNode('request_boundary', async () => ({ phase: 'model_started' }))
    .addNode('model', async () => {
      if (!prepared) await prepare();
      return { phase: 'reviewed', aiResult: await review() };
    })
    .addNode('persist', async value => { response = await save(value.aiResult); return { phase: 'saved', saved: true }; })
    .addEdge(START, 'context').addEdge('context', 'request_boundary').addEdge('request_boundary', 'model')
    .addEdge('model', 'persist').addEdge('persist', END)
    .compile({ checkpointer: checkpointer || await reviewCheckpointer() });
  const config = { configurable: { thread_id: thread }, callbacks: [], recursionLimit: 12, durability: 'sync' };
  return withRunTree(new RunTree({ name: 'prism.private-review-workflow', tracingEnabled: false }), async () => {
    const snapshot = await graph.getState(config);
    if (resume && !snapshot.createdAt) throw Object.assign(Error('Workflow checkpoint is missing or expired.'), { code: 'CHECKPOINT_UNAVAILABLE' });
    if (snapshot.values.saved) return load();
    // Once a request could have left this process, automatic replay risks duplicate inference.
    if (snapshot.values.phase === 'model_started') throw Object.assign(Error('Interrupted model request requires a fresh review.'), { code: 'INTERRUPTED_MODEL_REQUEST' });
    await graph.invoke(snapshot.createdAt ? null : { phase: 'new' }, config);
    return response;
  });
}

export { runReviewWorkflow };
