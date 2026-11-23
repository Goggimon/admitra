import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AdmissionsDatabase, EventsDatabase } from '../monitoring/sources.ts';
import { runMonitoringPass } from '../monitoring/scheduler.ts';
import { generateIcsCalendar } from '../calendar/generateICS.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');
const PUBLIC_DIR = join(ROOT, 'apps', 'web', 'public');
const PUBLIC_DATA_DIR = join(PUBLIC_DIR, 'data');

async function main() {
  const skipLiveFetch = process.argv.includes('--sync-only');
  const admissionsPath = join(DATA_DIR, 'admissions.json');
  const eventsPath = join(DATA_DIR, 'events.json');

  const admissions = JSON.parse(readFileSync(admissionsPath, 'utf8')) as AdmissionsDatabase;
  const eventsDb = JSON.parse(readFileSync(eventsPath, 'utf8')) as EventsDatabase;

  if (!skipLiveFetch) {
    console.log('[ADMITRA] Running daily monitoring check against active official sources...');
    const { summary } = await runMonitoringPass(admissions, eventsDb);
    writeFileSync(admissionsPath, JSON.stringify(admissions, null, 2) + '\n', 'utf8');
    writeFileSync(eventsPath, JSON.stringify(eventsDb, null, 2) + '\n', 'utf8');
    console.log(
      `[ADMITRA] Completed in ${summary.duration_ms}ms | checked=${summary.sources_checked} failed=${summary.sources_failed} changes=${summary.changes_detected}`
    );
    for (const src of admissions.sources.filter((s) => s.active)) {
      console.log(
        `  - ${src.source_id}: HTTP=${src.http_status} hash=${src.content_hash ? src.content_hash.slice(0, 12) : 'NONE'} failures=${src.consecutive_failures}${src.last_error ? ` err=${src.last_error}` : ''}`
      );
    }
  }

  // Generate calendar.ics and sync public JSON files for Vite dev & GitHub Pages
  mkdirSync(PUBLIC_DATA_DIR, { recursive: true });
  const icsContent = generateIcsCalendar(admissions.deadlines, eventsDb.events);
  writeFileSync(join(PUBLIC_DIR, 'calendar.ics'), icsContent, 'utf8');

  for (const filename of ['universities.json', 'examinations.json', 'admissions.json', 'events.json']) {
    copyFileSync(join(DATA_DIR, filename), join(PUBLIC_DATA_DIR, filename));
  }
  console.log('[ADMITRA] Synced data/*.json and generated apps/web/public/calendar.ics');
}

main().catch((err) => {
  console.error('[ADMITRA] Update failed:', err);
  process.exit(1);
});
