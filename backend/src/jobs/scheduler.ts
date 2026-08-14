import cron from 'node-cron';
import {
  runDailyAnalysisAllOrgs,
  runWeeklyBriefsAllOrgs,
} from '../services/briefingService';

let started = false;

export function startBackgroundJobs() {
  if (started) return;
  started = true;

  // Daily analysis 06:00 America/Regina-ish via server local; cron uses server TZ
  cron.schedule('0 6 * * *', () => {
    void runDailyAnalysisAllOrgs().then((r) =>
      console.log('[jobs] daily analysis', r.length, 'orgs')
    );
  });

  // Weekly brief Monday 07:00
  cron.schedule('0 7 * * 1', () => {
    void runWeeklyBriefsAllOrgs().then((r) =>
      console.log('[jobs] weekly briefs', r.length, 'orgs')
    );
  });

  console.log('[jobs] background schedules registered');
}
