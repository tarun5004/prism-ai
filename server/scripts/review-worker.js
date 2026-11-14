import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { processNextReview } from '../src/features/analysis/analysis.jobs.js';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
try {
  if (process.env.DEMO_ONLY === 'true' || !process.env.MONGODB_URI) throw Error('Worker storage unavailable.');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--resume' || !/^webhook-[a-f\d]{64}$/.test(args[1]))) throw Error('Invalid worker arguments.');
  // Trusted operator only: LangGraph refuses an uncertain model replay.
  const result = await processNextReview(args.length ? { resumeId: args[1] } : {});
  process.stdout.write(JSON.stringify({ event: 'review_worker', ...result }) + '\n');
} catch { process.stderr.write('Review worker unavailable. Check storage and queue configuration.\n'); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
