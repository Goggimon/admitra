import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AdmissionsDatabase, EventsDatabase } from '../monitoring/sources.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`VALIDATION FAILED: ${msg}`);
    process.exit(1);
  }
}

const universities = JSON.parse(readFileSync(join(ROOT, 'data', 'universities.json'), 'utf8')) as Array<{ id: string; verification_status: string }>;
const examinations = JSON.parse(readFileSync(join(ROOT, 'data', 'examinations.json'), 'utf8')) as Array<{ id: string; verification_status: string }>;
const admissions = JSON.parse(readFileSync(join(ROOT, 'data', 'admissions.json'), 'utf8')) as AdmissionsDatabase;
const eventsDb = JSON.parse(readFileSync(join(ROOT, 'data', 'events.json'), 'utf8')) as EventsDatabase;

assert(universities.length === 18, `Expected 18 universities, found ${universities.length}`);
assert(examinations.length === 8, `Expected 8 examinations, found ${examinations.length}`);
assert(admissions.sources.length >= 2, 'Expected at least 2 Phase 1 sources');
assert(admissions.deadlines.length >= 1, 'Expected verified deadlines in admissions.json');
assert(Array.isArray(eventsDb.events), 'events.json must contain an events array');

const icsPath = join(ROOT, 'apps', 'web', 'public', 'calendar.ics');
assert(existsSync(icsPath), 'apps/web/public/calendar.ics does not exist (run npm run update first)');
const ics = readFileSync(icsPath, 'utf8');
assert(ics.includes('BEGIN:VCALENDAR') && ics.includes('END:VCALENDAR'), 'Invalid VCALENDAR envelope');
assert(ics.includes('X-WR-TIMEZONE:Asia/Kolkata'), 'Missing Asia/Kolkata timezone header in calendar.ics');
assert(ics.includes('DTSTART;VALUE=DATE:'), 'Missing RFC 5545 date-only DTSTART entries');
assert(ics.includes('UID:admitra-'), 'Missing deterministic ADMITRA UIDs');

console.log(
  `[ADMITRA] Validation passed: ${universities.length} universities, ${examinations.length} exams, ${admissions.sources.length} sources, ${admissions.deadlines.length} deadlines, calendar.ics OK.`
);
