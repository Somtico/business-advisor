import dotenv from 'dotenv';
dotenv.config();

import { assertLearningContributorSaltConfigured } from './services/moat/contributorKey';

// Production: fail fast if LEARNING_CONTRIBUTOR_SALT is missing/blank.
// Never logs the secret value. Development/test may use the documented fallback.
assertLearningContributorSaltConfigured();

import app from './app';
import { startBackgroundJobs } from './jobs/scheduler';

const PORT = Number(process.env.PORT) || 5007;

app.listen(PORT, () => {
  console.log(`Somtico Business Advisor API listening on :${PORT}`);
  startBackgroundJobs();
});
