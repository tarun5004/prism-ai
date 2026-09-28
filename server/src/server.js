import 'dotenv/config';
import app from './app.js';

const port = process.env.PORT || 5000;

// Start the API server for local development.
function startServer() {
  app.listen(port, () => {
    console.log(`PRism API listening on port ${port}`);
  });
}

startServer();