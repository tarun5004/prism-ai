import 'dotenv/config';
import app from './app.js';
import { connectToDatabase } from './config/database.js';

const port = process.env.PORT || 5000;

// Connect optional persistence and start the API server for local development.
async function startServer() {
  await connectToDatabase();
  app.listen(port, () => {
    console.log(`PRism API listening on port ${port}`);
  });
}

startServer();