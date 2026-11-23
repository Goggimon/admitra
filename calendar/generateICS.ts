import type { DeadlineItem, TimelineEvent } from '../monitoring/sources.ts';

function escapeIcsText(text: string): string {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function formatUtcStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z'
  );
}

function formatDateOnlyCompact(yyyyMmDd: string): string {
  return yyyyMmDd.replace(/-/g, '');
}

function nextDateOnlyCompact(yyyyMmDd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyyMmDd);
  if (!m) return formatDateOnlyCompact(yyyyMmDd);
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}`;
}

export function generateIcsCalendar(
  deadlines: DeadlineItem[],
  events: TimelineEvent[],
  generatedAt: Date = new Date()
): string {
  const dtstamp = formatUtcStamp(generatedAt);
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ADMITRA//Admissions & Examination Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:ADMITRA Admissions & Exams',
    'X-WR-TIMEZONE:Asia/Kolkata',
    'X-WR-CALDESC:Verified and announced university admissions deadlines and entrance examination dates tracked by ADMITRA.'
  ];

  const seenUids = new Set<string>();

  for (const dl of deadlines) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dl.date)) continue;
    const uid = `admitra-${dl.id}@admitra.app`;
    if (seenUids.has(uid)) continue;
    seenUids.add(uid);

    const statusTag = dl.verification_status.toUpperCase();
    const desc = [
      `Institution/Exam: ${dl.entity_name}`,
      `Category: ${dl.category}`,
      `Verification: ${statusTag}`,
      `Original Timezone: ${dl.original_timezone}`,
      `Official Source: ${dl.source_url}`
    ].join('\n');

    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${formatDateOnlyCompact(dl.date)}`,
      `DTEND;VALUE=DATE:${nextDateOnlyCompact(dl.date)}`,
      `SUMMARY:${escapeIcsText(`[${statusTag}] ${dl.title}`)}`,
      `DESCRIPTION:${escapeIcsText(desc)}`,
      `URL:${dl.source_url}`,
      `STATUS:${dl.verification_status === 'verified' ? 'CONFIRMED' : 'TENTATIVE'}`,
      'END:VEVENT'
    );
  }

  for (const ev of events) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ev.date)) continue;
    const uid = `admitra-${ev.id}@admitra.app`;
    if (seenUids.has(uid)) continue;
    seenUids.add(uid);

    const statusTag = ev.verification_status.toUpperCase();
    const desc = [
      `Entity: ${ev.entity_name}`,
      `Event Type: ${ev.event_type}`,
      `Verification: ${statusTag}`,
      `Evidence: ${ev.evidence}`,
      `Official Source: ${ev.source_url}`
    ].join('\n');

    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${formatDateOnlyCompact(ev.date)}`,
      `DTEND;VALUE=DATE:${nextDateOnlyCompact(ev.date)}`,
      `SUMMARY:${escapeIcsText(`[${statusTag}] ${ev.title}`)}`,
      `DESCRIPTION:${escapeIcsText(desc)}`,
      `URL:${ev.source_url}`,
      `STATUS:${ev.verification_status === 'verified' ? 'CONFIRMED' : 'TENTATIVE'}`,
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR', '');
  return lines.join('\r\n');
}
