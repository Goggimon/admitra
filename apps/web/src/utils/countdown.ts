export interface IstCountdown {
  label: string;
  daysRemaining: number | null;
  urgency: 'overdue' | 'today' | 'critical' | 'soon' | 'upcoming' | 'unknown';
  istDateDisplay: string;
}

const IST_TZ = 'Asia/Kolkata';

/**
 * Returns YYYY-MM-DD in Asia/Kolkata (IST) for any Date object.
 */
export function getIstDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

function parseDateKeyToUtcDay(dateKey: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function formatIstDateTime(iso: string | undefined | null): string {
  if (!iso || iso === 'UNKNOWN') return 'UNKNOWN';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TZ,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(d) + ' IST';
}

export function calculateIstCountdown(dueIso: string | undefined | null, now: Date = new Date()): IstCountdown {
  if (!dueIso || dueIso === 'UNKNOWN') {
    return { label: 'UNKNOWN', daysRemaining: null, urgency: 'unknown', istDateDisplay: 'UNKNOWN' };
  }

  let targetKey = '';
  let istDateDisplay = dueIso;

  if (/^\d{4}-\d{2}-\d{2}$/.test(dueIso.trim())) {
    targetKey = dueIso.trim();
    const parsed = new Date(`${targetKey}T00:00:00+05:30`);
    if (!Number.isNaN(parsed.getTime())) {
      istDateDisplay = new Intl.DateTimeFormat('en-IN', {
        timeZone: IST_TZ,
        year: 'numeric',
        month: 'short',
        day: '2-digit'
      }).format(parsed);
    }
  } else {
    const parsed = new Date(dueIso);
    if (Number.isNaN(parsed.getTime())) {
      return { label: 'UNKNOWN', daysRemaining: null, urgency: 'unknown', istDateDisplay: 'UNKNOWN' };
    }
    targetKey = getIstDateKey(parsed);
    istDateDisplay = new Intl.DateTimeFormat('en-IN', {
      timeZone: IST_TZ,
      year: 'numeric',
      month: 'short',
      day: '2-digit'
    }).format(parsed);
  }

  const todayKey = getIstDateKey(now);
  const todayUtc = parseDateKeyToUtcDay(todayKey);
  const targetUtc = parseDateKeyToUtcDay(targetKey);
  if (todayUtc === null || targetUtc === null) {
    return { label: 'UNKNOWN', daysRemaining: null, urgency: 'unknown', istDateDisplay: 'UNKNOWN' };
  }

  const diffDays = Math.round((targetUtc - todayUtc) / 86400000);
  if (diffDays < 0) {
    return { label: `CLOSED ${Math.abs(diffDays)}d ago`, daysRemaining: diffDays, urgency: 'overdue', istDateDisplay };
  }
  if (diffDays === 0) {
    return { label: 'DUE TODAY (IST)', daysRemaining: 0, urgency: 'today', istDateDisplay };
  }
  if (diffDays <= 14) {
    return { label: `${diffDays}d left`, daysRemaining: diffDays, urgency: 'critical', istDateDisplay };
  }
  if (diffDays <= 45) {
    return { label: `${diffDays}d left`, daysRemaining: diffDays, urgency: 'soon', istDateDisplay };
  }
  return { label: `${diffDays}d left`, daysRemaining: diffDays, urgency: 'upcoming', istDateDisplay };
}
