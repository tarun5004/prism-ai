import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { processNextReview } from '../src/features/analysis/analysis.jobs.js';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
try {
  if (process.env.DEMO_ONLY === 'true' || !process.env.MONGODB_URI) throw Error('Worker storage unavailable.');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  const result = await processNextReview();
  process.stdout.write(JSON.stringify({ event: 'review_worker', ...result }) + '\n');
} catch { process.stderr.write('Review worker unavailable. Check storage and queue configuration.\n'); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
