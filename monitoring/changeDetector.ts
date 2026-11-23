import { createHash } from 'node:crypto';
import type { MonitoredSource, VerificationStatus } from './sources.ts';

export interface ChangeClassification {
  isMeaningful: boolean;
  eventType: string;
  verificationStatus: VerificationStatus;
  title: string;
  evidence: string;
  fingerprint: string;
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function computeLineDiff(prevText: string, nextText: string): { added: string[]; removed: string[]; summary: string } {
  const prevLines = prevText.split('\n').map((s) => s.trim()).filter(Boolean);
  const nextLines = nextText.split('\n').map((s) => s.trim()).filter(Boolean);
  const prevSet = new Set(prevLines);
  const nextSet = new Set(nextLines);

  const added = nextLines.filter((l) => !prevSet.has(l));
  const removed = prevLines.filter((l) => !nextSet.has(l));
  const summary = (`+ ${added.slice(0, 8).join(' | ')}${removed.length ? `\n- ${removed.slice(0, 5).join(' | ')}` : ''}`).trim();
  return { added, removed, summary };
}

export function isPureNoiseDiff(diff: { added: string[]; removed: string[] }): boolean {
  const changed = [...diff.added, ...diff.removed];
  if (changed.length === 0) return true;
  const noisePatterns = [
    /^last[\s_]+updated:/i,
    /^copyright/i,
    /^\d+\s+views?$/i,
    /^visitors?:\s*\d+/i
  ];
  return changed.every((line) => line.length < 10 || noisePatterns.some((re) => re.test(line)));
}

export function classifyChange(source: MonitoredSource, prevText: string, nextText: string): ChangeClassification {
  const diff = computeLineDiff(prevText, nextText);
  if (isPureNoiseDiff(diff)) {
    return {
      isMeaningful: false,
      eventType: 'general_update',
      verificationStatus: 'unverified',
      title: 'Non-substantive metadata update',
      evidence: diff.summary.slice(0, 400),
      fingerprint: ''
    };
  }

  const addedText = diff.added.join('\n');
  const rules: Array<{ re: RegExp; eventType: string; status: VerificationStatus; prefix: string }> = [
    {
      re: /(inviting\s+online\s+application|registration\s+(portal\s+)?(is\s+)?(now\s+)?open|apply\s+online\s+now)/i,
      eventType: source.entity_type === 'examination' ? 'reg_portal_opened' : 'application_opened',
      status: 'verified',
      prefix: source.entity_type === 'examination' ? 'Registration Portal Opened' : 'Applications Opened'
    },
    {
      re: /(applications?\s+to\s+study\s+at\s+unsw[^.\n]*now\s+open|undergraduate\s+applications?\s+are\s+now\s+open)/i,
      eventType: 'application_opened',
      status: 'verified',
      prefix: 'Undergraduate Applications Open'
    },
    {
      re: /(admit\s+card|hall\s+ticket).*(released|available|download)/i,
      eventType: 'admit_card_released',
      status: 'verified',
      prefix: 'Admit Card Released'
    },
    {
      re: /(extending\s+the\s+last\s+date|deadline\s+(extended|moved|changed|revised)|application\s+closing\s+date)/i,
      eventType: 'deadline_changed',
      status: 'verified',
      prefix: 'Application Deadline Updated'
    },
    {
      re: /(advisory|registration\s+dates?\s+announced|schedule|exam\s+date)/i,
      eventType: 'reg_dates_announced',
      status: 'announced',
      prefix: 'Official Announcement'
    },
    {
      re: /(declaration\s+of\s+.*(result|score|nta\s+score)|final\s+answer\s+key)/i,
      eventType: 'results_announced',
      status: 'verified',
      prefix: 'Results / Answer Key Announced'
    }
  ];

  const matched = rules.find((r) => r.re.test(addedText));
  const headline = (diff.added[0] || '').slice(0, 100);

  if (!matched) {
    return {
      isMeaningful: true,
      eventType: 'general_update',
      verificationStatus: 'unverified',
      title: `Unverified update on ${source.entity_name}`,
      evidence: diff.summary.slice(0, 1000),
      fingerprint: sha256Hex(`${source.source_id}|unverified|${headline.toLowerCase()}`).slice(0, 20)
    };
  }

  return {
    isMeaningful: true,
    eventType: matched.eventType,
    verificationStatus: matched.status,
    title: `${matched.prefix}: ${headline}`,
    evidence: diff.summary.slice(0, 1000),
    fingerprint: sha256Hex(`${source.entity_id}|${matched.eventType}|${headline.toLowerCase()}`).slice(0, 20)
  };
}
