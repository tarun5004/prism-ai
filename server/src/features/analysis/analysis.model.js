import mongoose from 'mongoose';

const analysisSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    status: { type: String, required: true },
    createdAt: { type: String, required: true },
    pullRequest: { type: mongoose.Schema.Types.Mixed, required: true },
    findings: { type: [mongoose.Schema.Types.Mixed], default: [] },
    aiStatus: { type: String, enum: ['skipped', 'completed', 'partial', 'unavailable'] },
    aiModel: { type: String },
    aiError: { type: String },
    aiCoverage: { type: mongoose.Schema.Types.Mixed },
    error: { type: String }
  },
  { versionKey: false }
);

const Analysis = mongoose.models.Analysis || mongoose.model('Analysis', analysisSchema);

export default Analysis;
