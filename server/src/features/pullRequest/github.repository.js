import mongoose from 'mongoose';
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

// Authentication has a separate lifetime from saved review reports.
const schema = new mongoose.Schema({ _id: String, kind: String, sealed: String, count: Number, expiresAt: Date }, { versionKey: false });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const AuthState = mongoose.models.GitHubAuthState || mongoose.model('GitHubAuthState', schema);
const local = new Map();
const idFor = (kind, id) => createHash('sha256').update(`${kind}:${id}`).digest('hex');

function encryptionKey() {
  const key = Buffer.from(process.env.SESSION_ENCRYPTION_KEY || '', 'base64');
  if (key.length !== 32) throw Error('Session storage unavailable.');
  return key;
}

function sealAuthData(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(part => part.toString('base64url')).join('.');
}

function openAuthData(sealed) {
  const [iv, tag, data] = sealed.split('.').map(value => Buffer.from(value, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8'));
}

function persistent() {
  if (mongoose.connection.readyState === 1) return true;
  if (process.env.NODE_ENV === 'production') throw Error('Session storage unavailable.');
  for (const [id, record] of local) if (record.expiresAt <= Date.now()) local.delete(id);
  return false;
}

async function writeAuthRecord(kind, id, value, expiresAt) {
  const key = idFor(kind, id);
  if (persistent()) {
    await AuthState.updateOne({ _id: key }, { $set: { kind, sealed: sealAuthData(value), expiresAt: new Date(expiresAt) } }, { upsert: true });
  } else {
    if (local.size >= 2000 && !local.has(key)) throw Error('Session storage unavailable.');
    local.set(key, { value, expiresAt });
  }
}

async function readAuthRecord(kind, id, consume = false) {
  if (typeof id !== 'string' || !id || id.length > 256) return null;
  const key = idFor(kind, id);
  if (persistent()) {
    const query = { _id: key, expiresAt: { $gt: new Date() } };
    // Atomic deletion makes OAuth state single-use even across API instances.
    const record = await (consume ? AuthState.findOneAndDelete(query) : AuthState.findOne(query)).lean();
    return record ? openAuthData(record.sealed) : null;
  }
  const record = local.get(key);
  if (consume) local.delete(key);
  return record?.value || null;
}

async function deleteAuthRecord(kind, id) {
  if (typeof id !== 'string' || !id) return;
  const key = idFor(kind, id);
  if (persistent()) await AuthState.deleteOne({ _id: key });
  else local.delete(key);
}

async function incrementReviewCounter(id, limit, expiresAt) {
  const key = idFor('budget', id);
  if (persistent()) {
    try { await AuthState.updateOne({ _id: key }, { $setOnInsert: { kind: 'budget', count: 0, expiresAt: new Date(expiresAt) } }, { upsert: true }); }
    catch (error) { if (error.code !== 11000) throw error; }
    return Boolean(await AuthState.findOneAndUpdate({ _id: key, count: { $lt: limit } }, { $inc: { count: 1 } }).lean());
  }
  const record = local.get(key) || { count: 0, expiresAt };
  if (record.count >= limit) return false;
  record.count++; local.set(key, record);
  return true;
}

export { AuthState, sealAuthData, openAuthData, writeAuthRecord, readAuthRecord, deleteAuthRecord, incrementReviewCounter };
