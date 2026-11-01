import mongoose from 'mongoose';

const analysisSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    installationId: { type: Number, index: true },
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
      headSha: String
    },
    aiStatus: { type: String, enum: ['skipped', 'completed', 'partial', 'unavailable'] },
    aiModel: { type: String },
    aiError: { type: String },
    aiCoverage: { type: mongoose.Schema.Types.Mixed },
    aiReview: { type: mongoose.Schema.Types.Mixed },
    aiDiagnostics: {
      runId: String,
      promptVersion: String,
      schemaVersion: String,
      usage: { type: new mongoose.Schema({ inputTokens: Number, outputTokens: Number, thinkingTokens: Number, totalTokens: Number }, { _id: false }), default: undefined },
      durationMs: { type: Number },
      timeoutMs: { type: Number },
      attempts: { type: Number },
      httpStatus: { type: Number },
      networkCode: { type: String },
      failureCategory: { type: String }
    },
    error: { type: String },
    errorCode: { type: String }
  },
  { versionKey: false }
);

const Analysis = mongoose.models.Analysis || mongoose.model('Analysis', analysisSchema);

export default Analysis;
