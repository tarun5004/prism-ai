import { containsSensitiveText } from '../ai/ai.context.js';

const defaults = { autoReview: true, ignorePaths: [], pathInstructions: [] };
const matchesPath = (path, prefix) => prefix.endsWith('/') ? path.startsWith(prefix) : path === prefix;
const validPath = path => typeof path === 'string' && path.length > 0 && path.length <= 200
  && !path.startsWith('/') && !path.split('/').includes('..') && !/[\\*?\x00-\x1f]/.test(path);

// Small JSON contract, not a configuration language or executable glob engine.
function parseReviewPolicy(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !Object.hasOwn(defaults, key))) throw Error('Invalid repository policy.');
  const policy = { ...defaults, ...value };
  if (typeof policy.autoReview !== 'boolean' || !Array.isArray(policy.ignorePaths) || policy.ignorePaths.length > 20
    || policy.ignorePaths.some(path => !validPath(path)) || !Array.isArray(policy.pathInstructions) || policy.pathInstructions.length > 10
    || policy.pathInstructions.some(item => !item || Object.keys(item).some(key => !['path', 'instructions'].includes(key))
      || !validPath(item.path) || typeof item.instructions !== 'string' || !item.instructions.trim()
      || item.instructions.length > 500 || containsSensitiveText(item.instructions))) throw Error('Invalid repository policy.');
  return policy;
}

function applyReviewPolicy(pullRequest, policy) {
  const changedFiles = pullRequest.changedFiles.filter(file => !policy.ignorePaths.some(prefix => matchesPath(file.path, prefix)));
  return { ...pullRequest, changedFiles,
    reviewScope: { ...pullRequest.reviewScope, excludedPaths: pullRequest.changedFiles.filter(file => !changedFiles.includes(file)).map(file => file.path) },
    reviewGuidelines: policy.pathInstructions.filter(item => changedFiles.some(file => matchesPath(file.path, item.path))) };
}

export { parseReviewPolicy, applyReviewPolicy };
