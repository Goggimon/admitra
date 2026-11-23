import type { AdmissionsDatabase, EventsDatabase, MonitoredSource, MonitoringRunSummary } from './sources.ts';
import { fetchAndScrapeSource, type ScrapedResult } from './scraper.ts';
import { classifyChange, sha256Hex } from './changeDetector.ts';

export type FetcherFn = (source: MonitoredSource) => Promise<ScrapedResult>;

/**
 * Runs one monitoring pass over all active sources.
 * Preserves previously verified dates and content hashes when a source fails, times out, or is blocked.
 */
export async function runMonitoringPass(
  admissions: AdmissionsDatabase,
  eventsDb: EventsDatabase,
  fetcher: FetcherFn = (s) => fetchAndScrapeSource(s, 15000),
  now: Date = new Date()
): Promise<{ admissions: AdmissionsDatabase; eventsDb: EventsDatabase; summary: MonitoringRunSummary }> {
  const startedMs = now.getTime();
  const startedIso = now.toISOString();
  const todayIst = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);

  let checked = 0;
  let failed = 0;
  let changesDetected = 0;

  const existingIds = new Set(eventsDb.events.map((e) => e.id));

  for (const source of admissions.sources) {
    if (!source.active) continue;
    checked++;

    const result = await fetcher(source);
    if (!result.ok) {
      // Failure isolation: preserve content_hash, last_excerpt, and previously verified dates!
      failed++;
      source.http_status = result.httpStatus;
      source.consecutive_failures = (source.consecutive_failures || 0) + 1;
      source.last_error = result.error;
      continue;
    }

    const newHash = sha256Hex(result.normalizedText);
    const prevHash = source.content_hash;
    const prevExcerpt = source.last_excerpt || '';

    source.http_status = result.httpStatus;
    source.consecutive_failures = 0;
    source.last_error = null;
    source.verification_history.last_successful_check = startedIso;

    if (!prevHash) {
      // First baseline capture: store hash and excerpt without firing a false change event
      source.content_hash = newHash;
      source.last_excerpt = result.excerpt;
      continue;
    }

    if (newHash === prevHash) {
      continue;
    }

    // Content hash changed
    const classified = classifyChange(source, prevExcerpt, result.normalizedText);
    source.content_hash = newHash;
    source.last_excerpt = result.excerpt;

    if (classified.isMeaningful) {
      changesDetected++;
      source.verification_history.last_detected_change = startedIso;
      const eventId = `evt_${classified.fingerprint}`;
      if (!existingIds.has(eventId)) {
        existingIds.add(eventId);
        eventsDb.events.unshift({
          id: eventId,
          entity_type: source.entity_type,
          entity_id: source.entity_id,
          entity_name: source.entity_name,
          event_type: classified.eventType,
          title: classified.title,
          date: todayIst,
          date_only: true,
          verification_status: classified.verificationStatus,
          source_url: source.url,
          evidence: classified.evidence,
          detected_at: startedIso
        });
      }
    }
  }

  const finishedMs = Date.now();
  const summary: MonitoringRunSummary = {
    started_at: startedIso,
    finished_at: new Date(finishedMs).toISOString(),
    duration_ms: Math.max(0, finishedMs - startedMs),
    sources_checked: checked,
    sources_failed: failed,
    changes_detected: changesDetected
  };

  admissions.generated_at = summary.finished_at;
  eventsDb.last_run = summary;

  return { admissions, eventsDb, summary };
}
