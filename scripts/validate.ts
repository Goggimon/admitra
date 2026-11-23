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

const VALID_STATUSES = new Set(['verified', 'announced', 'unverified']);

const profile = JSON.parse(readFileSync(join(ROOT, 'data', 'profile.json'), 'utf8')) as {
  nationality: string;
  qualification: string;
  target_entry: string;
  academic_scores: Record<string, unknown>;
  test_scores: Record<string, unknown>;
};
const universities = JSON.parse(readFileSync(join(ROOT, 'data', 'universities.json'), 'utf8')) as Array<{
  id: string;
  official_name: string;
  verification_status: string;
  programme?: { official_name: string; genuine_ece: boolean };
}>;
const examinations = JSON.parse(readFileSync(join(ROOT, 'data', 'examinations.json'), 'utf8')) as Array<{
  id: string;
  official_name: string;
  verification_status: string;
  sessions?: Array<{ name: string }>;
}>;
const supplementary = JSON.parse(readFileSync(join(ROOT, 'data', 'supplementary.json'), 'utf8')) as Array<{
  id: string;
  short_code: string;
}>;
const admissions = JSON.parse(readFileSync(join(ROOT, 'data', 'admissions.json'), 'utf8')) as AdmissionsDatabase;
const eventsDb = JSON.parse(readFileSync(join(ROOT, 'data', 'events.json'), 'utf8')) as EventsDatabase;

assert(profile.nationality === 'Indian' && profile.qualification === 'CBSE Class 12', 'Invalid student profile');
assert(profile.test_scores.sat_total === null, 'Unknown SAT score must remain null (not fabricated)');
assert(universities.length === 18, `Expected exactly 18 universities, found ${universities.length}`);
assert(examinations.length === 8, `Expected exactly 8 entrance examinations, found ${examinations.length}`);
assert(supplementary.length === 2, `Expected 2 supplementary requirements (SAT & CBSE), found ${supplementary.length}`);

for (const u of universities) {
  assert(VALID_STATUSES.has(u.verification_status), `Invalid verification_status on ${u.id}`);
  assert(Boolean(u.programme?.official_name), `Missing programme info on ${u.id}`);
}
for (const ex of examinations) {
  assert(VALID_STATUSES.has(ex.verification_status), `Invalid verification_status on ${ex.id}`);
  assert(Array.isArray(ex.sessions) && ex.sessions.length >= 1, `Missing sessions array on ${ex.id}`);
}

const jeem = examinations.find((e) => e.id === 'exam_jeem');
assert(Boolean(jeem && jeem.sessions && jeem.sessions.length === 2), 'JEE Main must track Session 1 & Session 2 independently');
const bitsat = examinations.find((e) => e.id === 'exam_bitsat');
assert(Boolean(bitsat && bitsat.sessions && bitsat.sessions.length === 2), 'BITSAT must track Session 1 & Session 2 independently');

assert(admissions.sources.length >= 2, 'Expected at least 2 monitored sources');
assert(admissions.deadlines.length >= 10, 'Expected verified 2027 deadlines in admissions.json');
for (const dl of admissions.deadlines) {
  assert(VALID_STATUSES.has(dl.verification_status), `Invalid verification_status on deadline ${dl.id}`);
  assert(/^https?:\/\//.test(dl.source_url), `Missing official source_url on deadline ${dl.id}`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(dl.date), `Invalid date format on deadline ${dl.id}`);
}
assert(Array.isArray(eventsDb.events), 'events.json must contain an events array');

const icsPath = join(ROOT, 'apps', 'web', 'public', 'calendar.ics');
assert(existsSync(icsPath), 'apps/web/public/calendar.ics does not exist (run npm run update first)');
const ics = readFileSync(icsPath, 'utf8');
assert(ics.includes('BEGIN:VCALENDAR') && ics.includes('END:VCALENDAR'), 'Invalid VCALENDAR envelope');
assert(ics.includes('X-WR-TIMEZONE:Asia/Kolkata'), 'Missing Asia/Kolkata timezone header in calendar.ics');
assert(ics.includes('DTSTART;VALUE=DATE:'), 'Missing RFC 5545 date-only DTSTART entries');
assert(ics.includes('BEGIN:VALARM'), 'Missing VALARM reminder entries in calendar.ics');
assert(ics.includes('UID:admitra-'), 'Missing deterministic ADMITRA UIDs');

console.log(
  `[ADMITRA] Validation passed: ${universities.length} universities, ${examinations.length} exams + ${supplementary.length} supplementary (SAT/CBSE), ${admissions.sources.length} sources, ${admissions.deadlines.length} deadlines, calendar.ics OK.`
);
