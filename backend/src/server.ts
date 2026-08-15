import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { startBackgroundJobs } from './jobs/scheduler';

const PORT = Number(process.env.PORT) || 5007;

app.listen(PORT, () => {
  console.log(`AI Business Advisor API listening on :${PORT}`);
  startBackgroundJobs();
});
