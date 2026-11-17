import mongoose from 'mongoose';

const analysisSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    installationId: { type: Number, index: true },
    githubFeedback: { status: { type: String, enum: ['posted', 'existing', 'unavailable', 'skipped'] }, errorCode: String },
    githubInline: { status: String, errorCode: String },
    githubStatus: { status: String, errorCode: String },
    emailNotification: { status: { type: String, enum: ['sending', 'sent', 'unavailable', 'skipped'] }, errorCode: String },
    status: { type: String, required: true },
    createdAt: { type: String, required: true },
    pullRequest: { type: mongoose.Schema.Types.Mixed, required: true },
    findings: { type: [mongoose.Schema.Types.Mixed], default: [] },
    feedback: { type: mongoose.Schema.Types.Mixed, default: {} },
    trigger: {
      type: { type: String, enum: ['github_webhook'] },
      deliveryId: String,
      action: String,
      repository: String,
      baseSha: String,
      headSha: String,
      actorId: String,
      command: String
    },
    aiStatus: { type: String, enum: ['skipped', 'completed', 'partial', 'unavailable'] },
    aiModel: { type: String },
    aiProvider: { type: String, enum: ['gemini', 'mistral', 'xai', 'groq'] },
    aiError: { type: String },
    aiCoverage: { type: mongoose.Schema.Types.Mixed },
    aiReview: { type: mongoose.Schema.Types.Mixed },
    aiDiagnostics: {
      pipeline: mongoose.Schema.Types.Mixed,
      tracing: mongoose.Schema.Types.Mixed,
      workflow: mongoose.Schema.Types.Mixed,
      runId: String,
      inputCharacters: Number,
      inputBytes: Number,
      promptVersion: String,
      schemaVersion: String,
      usage: { type: new mongoose.Schema({ inputTokens: Number, outputTokens: Number, thinkingTokens: Number, totalTokens: Number }, { _id: false }), default: undefined },
      durationMs: { type: Number },
      timeoutMs: { type: Number },
      attempts: { type: Number },
      retryReason: String,
      httpStatus: { type: Number },
      networkCode: { type: String },
      failureCategory: { type: String }
    },
    error: { type: String },
    errorCode: { type: String }
  },
  { versionKey: false }
);

analysisSchema.index({ installationId: 1, 'pullRequest.repository': 1, createdAt: -1 });
analysisSchema.index({ installationId: 1, 'pullRequest.key': 1, createdAt: -1 });
const Analysis = mongoose.models.Analysis || mongoose.model('Analysis', analysisSchema);

const jobSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  status: { type: String, enum: ['queued', 'running', 'completed', 'failed', 'unknown', 'skipped'], default: 'queued' },
  payload: mongoose.Schema.Types.Mixed,
  owner: String, leaseUntil: Date, errorCode: String,
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });
jobSchema.index({ status: 1, leaseUntil: 1 });
const ReviewJob = mongoose.models.ReviewJob || mongoose.model('ReviewJob', jobSchema);
export { ReviewJob };

const controlSchema = new mongoose.Schema({ key: { type: String, unique: true }, paused: Boolean, commentId: Number }, { versionKey: false });
const ReviewControl = mongoose.models.ReviewControl || mongoose.model('ReviewControl', controlSchema);
export { ReviewControl };

export default Analysis;
