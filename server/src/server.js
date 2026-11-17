import 'dotenv/config';
import { startServer } from './bootstrap/http.js';

startServer().catch(() => {
  process.stderr.write('PRism startup failed. Check deployment configuration and database availability.\n');
  process.exitCode = 1;
});
