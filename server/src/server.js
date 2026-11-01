import 'dotenv/config';
import app from './app.js';
import { connectToDatabase } from './config/database.js';

const port = process.env.PORT || 5000;

// Connect optional persistence and start the API server for local development.
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    const origin = new URL(process.env.APP_ORIGIN || 'http://invalid');
    if (origin.protocol !== 'https:' || origin.origin !== process.env.APP_ORIGIN || !['GITHUB_APP_ID', 'GITHUB_APP_SLUG', 'GITHUB_APP_CLIENT_ID', 'GITHUB_APP_CLIENT_SECRET', 'GITHUB_APP_PRIVATE_KEY', 'GITHUB_WEBHOOK_SECRET', 'MONGODB_URI'].every(key => process.env[key]?.trim())) throw Error('Production requires HTTPS origin, GitHub App credentials and persistent MongoDB.');
  }
  const connected = await connectToDatabase();
  if (!connected && process.env.NODE_ENV === 'production') throw Error('Persistent MongoDB is required in production.');
  app.listen(port, () => {
    process.stdout.write(JSON.stringify({ event: 'server_started', port }) + '\n');
  });
}

startServer().catch(() => { process.stderr.write('PRism startup failed. Check deployment configuration and database availability.\n'); process.exitCode = 1; });
