import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJeeMainNoticesHtml, parseUnswAdmissionsHtml } from './scraper.ts';
import { classifyChange } from './changeDetector.ts';
import { runMonitoringPass } from './scheduler.ts';
import { generateIcsCalendar } from '../calendar/generateICS.ts';
import type { AdmissionsDatabase, EventsDatabase } from './sources.ts';

const UNSW_V1 = '<html><body><main><h2>2027 application dates</h2><p>Applications for Term 2 2027 coming soon.</p><p>Term 2 2027 Offshore closing date Thursday, 25 February 2027</p></main></body></html>';
const UNSW_V2 = '<html><body><main><h2>2027 application dates</h2><p>Applications to study at UNSW Sydney across all 2027 terms are now open.</p><p>Term 2 2027 Offshore closing date Thursday, 25 February 2027</p></main></body></html>';
const JEEM_V1 = '<html><body><main><h1>Public Notices</h1><a href="/n1.pdf">Advisory and Instructions regarding registration process for Joint Entrance Examination (Main) - 2027 (Session 1)</a><p>Last Updated: Nov 18, 2026</p></main></body></html>';
const JEEM_NOISE = '<html><body><main><h1>Public Notices</h1><a href="/n1.pdf">Advisory and Instructions regarding registration process for Joint Entrance Examination (Main) - 2027 (Session 1)</a><p>Last Updated: Nov 20, 2026</p></main></body></html>';
const JEEM_OPEN = '<html><body><main><h1>Public Notices</h1><a href="/n2.pdf">Inviting Online Application form for the Joint Entrance Examination (JEE)-2027 (Session 1) - Reg.</a><a href="/n1.pdf">Advisory and Instructions regarding registration process for Joint Entrance Examination (Main) - 2027 (Session 1)</a><p>Last Updated: Nov 20, 2026</p></main></body></html>';

function makeFixtureState(): { admissions: AdmissionsDatabase; eventsDb: EventsDatabase } {
  return {
    admissions: {
      schema_version: '1.0.0-github-native',
      generated_at: '2026-11-23T00:00:00.000Z',
      timezone: 'Asia/Kolkata',
      sources: [
        {
          source_id: 'src_unsw',
          entity_type: 'university',
          entity_id: 'uni_unsw',
          entity_name: 'UNSW Sydney',
          title: 'UNSW Admissions',
          url: 'https://www.unsw.edu.au/study/international-students/admissions-info',
          adapter: 'unsw_intl_admissions',
          active: true,
          http_status: null,
          content_hash: null,
          last_excerpt: '',
          consecutive_failures: 0,
          last_error: null,
          verification_history: {
            last_successful_check: null,
            last_detected_change: null,
            previous_verified_date: null,
            current_verified_date: '2027-02-25'
          }
        },
        {
          source_id: 'src_jeem',
          entity_type: 'examination',
          entity_id: 'exam_jeem',
          entity_name: 'JEE Main',
          title: 'JEE Main Notices',
          url: 'https://jeemain.nta.nic.in/public-notices/',
          adapter: 'jee_main_public_notices',
          active: true,
          http_status: null,
          content_hash: null,
          last_excerpt: '',
          consecutive_failures: 0,
          last_error: null,
          verification_history: {
            last_successful_check: null,
            last_detected_change: null,
            previous_verified_date: null,
            current_verified_date: null
          }
        }
      ],
      deadlines: [
        {
          id: 'dl_unsw_t2_2027_offshore',
          entity_type: 'university',
          entity_id: 'uni_unsw',
          entity_name: 'UNSW Sydney',
          category: 'application_deadline',
          title: 'UNSW Term 2 2027 Offshore Closing',
          date: '2027-02-25',
          date_only: true,
          original_timezone: 'Australia/Sydney',
          verification_status: 'verified',
          source_url: 'https://www.unsw.edu.au/study/international-students/admissions-info',
          verification_history: {
            last_successful_check: '2026-11-23T00:00:00.000Z',
            last_detected_change: null,
            previous_verified_date: null,
            current_verified_date: '2027-02-25'
          }
        }
      ]
    },
    eventsDb: { last_run: null, events: [] }
  };
}

test('Baseline pass captures hashes without false alerts and suppresses LAST_UPDATED noise', async () => {
  const { admissions, eventsDb } = makeFixtureState();
  const base = await runMonitoringPass(admissions, eventsDb, async (s) => {
    const parsed = s.adapter === 'unsw_intl_admissions' ? parseUnswAdmissionsHtml(UNSW_V1) : parseJeeMainNoticesHtml(JEEM_V1);
    return { ok: true, httpStatus: '200', adapter: s.adapter, ...parsed, error: null };
  });
  assert.equal(base.summary.sources_checked, 2);
  assert.equal(base.summary.changes_detected, 0);
  assert.ok(admissions.sources[0].content_hash);

  // Noise-only Last Updated change
  const noise = await runMonitoringPass(admissions, eventsDb, async (s) => {
    const parsed = s.adapter === 'unsw_intl_admissions' ? parseUnswAdmissionsHtml(UNSW_V1) : parseJeeMainNoticesHtml(JEEM_NOISE);
    return { ok: true, httpStatus: '200', adapter: s.adapter, ...parsed, error: null };
  });
  assert.equal(noise.summary.changes_detected, 0);
  assert.equal(eventsDb.events.length, 0);
});

test('Detects real UNSW opening and JEE Main registration opening, then deduplicates', async () => {
  const { admissions, eventsDb } = makeFixtureState();
  await runMonitoringPass(admissions, eventsDb, async (s) => {
    const parsed = s.adapter === 'unsw_intl_admissions' ? parseUnswAdmissionsHtml(UNSW_V1) : parseJeeMainNoticesHtml(JEEM_V1);
    return { ok: true, httpStatus: '200', adapter: s.adapter, ...parsed, error: null };
  });

  const openRun = await runMonitoringPass(admissions, eventsDb, async (s) => {
    const parsed = s.adapter === 'unsw_intl_admissions' ? parseUnswAdmissionsHtml(UNSW_V2) : parseJeeMainNoticesHtml(JEEM_OPEN);
    return { ok: true, httpStatus: '200', adapter: s.adapter, ...parsed, error: null };
  });
  assert.equal(openRun.summary.changes_detected, 2);
  assert.equal(eventsDb.events.length, 2);
  assert.ok(eventsDb.events.some((e) => e.entity_id === 'uni_unsw' && e.verification_status === 'verified'));
  assert.ok(eventsDb.events.some((e) => e.entity_id === 'exam_jeem' && e.event_type === 'reg_portal_opened'));

  // Re-run unchanged -> zero duplicates
  const dupRun = await runMonitoringPass(admissions, eventsDb, async (s) => {
    const parsed = s.adapter === 'unsw_intl_admissions' ? parseUnswAdmissionsHtml(UNSW_V2) : parseJeeMainNoticesHtml(JEEM_OPEN);
    return { ok: true, httpStatus: '200', adapter: s.adapter, ...parsed, error: null };
  });
  assert.equal(dupRun.summary.changes_detected, 0);
  assert.equal(eventsDb.events.length, 2);
});

test('Preserves previously verified dates and hashes when source fails or times out', async () => {
  const { admissions, eventsDb } = makeFixtureState();
  admissions.sources[0].content_hash = 'abc123verifiedhash';
  admissions.sources[0].verification_history.current_verified_date = '2027-02-25';

  const failRun = await runMonitoringPass(admissions, eventsDb, async () => ({
    ok: false,
    httpStatus: '503',
    adapter: 'unsw_intl_admissions',
    normalizedText: '',
    excerpt: '',
    error: 'HTTP 503'
  }));
  assert.equal(failRun.summary.sources_failed, 2);
  assert.equal(admissions.sources[0].content_hash, 'abc123verifiedhash');
  assert.equal(admissions.sources[0].verification_history.current_verified_date, '2027-02-25');
  assert.equal(admissions.sources[0].consecutive_failures, 1);
  assert.equal(eventsDb.events.length, 0);
});

test('Generates RFC 5545 calendar.ics with deterministic UIDs, exclusive next-day DTEND, and Asia/Kolkata', () => {
  const { admissions, eventsDb } = makeFixtureState();
  const ics = generateIcsCalendar(admissions.deadlines, eventsDb.events, new Date('2026-11-23T18:00:00Z'));
  assert.ok(ics.includes('X-WR-TIMEZONE:Asia/Kolkata'));
  assert.ok(ics.includes('UID:admitra-dl_unsw_t2_2027_offshore@admitra.app'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20270225'));
  assert.ok(ics.includes('DTEND;VALUE=DATE:20270226'));
  assert.ok(ics.includes('STATUS:CONFIRMED'));
  // Ensure classifyChange handles generic unverified text honestly
  const cls = classifyChange(admissions.sources[0], 'old line one two three', 'completely unrelated campus event notice');
  assert.equal(cls.verificationStatus, 'unverified');
});
