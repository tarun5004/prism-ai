import mongoose from 'mongoose';

const analysisSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    status: { type: String, required: true },
    createdAt: { type: String, required: true },
    pullRequest: { type: mongoose.Schema.Types.Mixed, required: true },
    findings: { type: [mongoose.Schema.Types.Mixed], default: [] },
    error: { type: String }
  },
  { versionKey: false }
);

const Analysis = mongoose.models.Analysis || mongoose.model('Analysis', analysisSchema);

export default Analysis;