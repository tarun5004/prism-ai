import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { checkGeminiConnection } from '../src/features/ai/ai.service.js';

// Resolve the backend environment independently of the terminal's current directory.
config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

const result = await checkGeminiConnection();
console.log(JSON.stringify({ model: process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash', ...result }));
if (result.status !== 'ok') process.exitCode = 1;
