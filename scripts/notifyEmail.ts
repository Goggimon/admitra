import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AdmissionsDatabase, DeadlineItem, EventsDatabase } from '../monitoring/sources.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function getIstTodayKey(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

function daysUntil(dateKey: string, todayKey: string): number {
  const a = Date.parse(`${todayKey}T00:00:00Z`);
  const b = Date.parse(`${dateKey}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

/**
 * Evaluates high-signal alerts (approaching deadlines in <= 7 days, openings in <= 3 days, or newly detected changes)
 * and sends a concise email digest via Resend HTTP API if RESEND_API_KEY + NOTIFY_EMAIL are configured in GitHub Secrets.
 * Safely exits 0 when email secrets are not configured so daily CI never fails.
 */
async function main() {
  const admissions = JSON.parse(readFileSync(join(ROOT, 'data', 'admissions.json'), 'utf8')) as AdmissionsDatabase;
  const eventsDb = JSON.parse(readFileSync(join(ROOT, 'data', 'events.json'), 'utf8')) as EventsDatabase;

  const todayKey = getIstTodayKey();
  const urgentDeadlines: Array<DeadlineItem & { daysLeft: number }> = [];

  for (const dl of admissions.deadlines) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dl.date)) continue;
    const d = daysUntil(dl.date, todayKey);
    // Notify only at high-signal thresholds (today, 1d, 3d, 7d) to avoid notification spam
    if (d === 0 || d === 1 || d === 3 || d === 7) {
      urgentDeadlines.push({ ...dl, daysLeft: d });
    }
  }

  const recentChanges = eventsDb.events.filter((ev) => {
    const detectedDay = ev.detected_at ? ev.detected_at.slice(0, 10) : '';
    return detectedDay === todayKey && /changed|opened|announced|admit_card|results/i.test(ev.event_type);
  });

  if (urgentDeadlines.length === 0 && recentChanges.length === 0) {
    console.log('[ADMITRA] Email digest: no high-signal alerts today (skipping to avoid spam).');
    return;
  }

  const lines: string[] = [
    `ADMITRA Daily Admissions Alert (${todayKey} IST)`,
    ''
  ];

  if (urgentDeadlines.length > 0) {
    lines.push('APPROACHING DEADLINES & MILESTONES:');
    for (const item of urgentDeadlines) {
      const label = item.daysLeft === 0 ? 'TODAY' : `${item.daysLeft}d left`;
      lines.push(`- [${label}] ${item.entity_name}: ${item.title} (${item.date}) [${item.verification_status.toUpperCase()}]`);
      lines.push(`  Source: ${item.source_url}`);
    }
    lines.push('');
  }

  if (recentChanges.length > 0) {
    lines.push('RECENTLY DETECTED CHANGES:');
    for (const ev of recentChanges) {
      lines.push(`- [${ev.verification_status.toUpperCase()}] ${ev.entity_name}: ${ev.title}`);
      lines.push(`  Source: ${ev.source_url}`);
    }
  }

  const textBody = lines.join('\n');
  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.NOTIFY_EMAIL;
  const fromEmail = process.env.NOTIFY_FROM || 'ADMITRA Alerts <onboarding@resend.dev>';

  if (!apiKey || !toEmail) {
    console.log('[ADMITRA] Email secrets (RESEND_API_KEY / NOTIFY_EMAIL) not configured. Alert preview:\n' + textBody);
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [toEmail],
      subject: `[ADMITRA] ${urgentDeadlines.length} deadline alert(s), ${recentChanges.length} change(s) — ${todayKey}`,
      text: textBody
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    console.warn(`[ADMITRA] Email delivery warning (HTTP ${res.status}): ${errText}`);
    return;
  }

  console.log(`[ADMITRA] Sent daily email alert to ${toEmail}.`);
}

main().catch((err) => {
  console.warn('[ADMITRA] Email notification skipped due to error:', err);
});
