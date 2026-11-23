import type { DeadlineItem } from '../../../../monitoring/sources';
import { calculateIstCountdown, getIstDateKey } from './countdown';

export interface NotificationPrefs {
  enabled: boolean;
  leadDays: number;
  applicationDeadlines: boolean;
  scholarships: boolean;
  examinations: boolean;
  deadlineChanges: boolean;
}

const PREFS_KEY = 'admitra_notification_prefs_v1';
const SENT_KEY = 'admitra_notified_ids_v1';

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: false,
  leadDays: 7,
  applicationDeadlines: true,
  scholarships: true,
  examinations: true,
  deadlineChanges: true
};

export function loadNotificationPrefs(): NotificationPrefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_NOTIFICATION_PREFS;
    return { ...DEFAULT_NOTIFICATION_PREFS, ...(JSON.parse(raw) as Partial<NotificationPrefs>) };
  } catch {
    return DEFAULT_NOTIFICATION_PREFS;
  }
}

export function saveNotificationPrefs(prefs: NotificationPrefs): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota errors
  }
}

export function isBrowserNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isBrowserNotificationSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  return await Notification.requestPermission();
}

export function sendTestNotification(): boolean {
  if (!isBrowserNotificationSupported() || Notification.permission !== 'granted') return false;
  new Notification('ADMITRA Alerts Active', {
    body: 'Browser push notifications are enabled for Fall 2027 admissions, scholarships, and exam deadlines.'
  });
  return true;
}

function categoryAllowed(cat: DeadlineItem['category'], prefs: NotificationPrefs): boolean {
  if (cat === 'scholarship_opening' || cat === 'scholarship_deadline') return prefs.scholarships;
  if (cat === 'application_opening' || cat === 'application_deadline' || cat === 'decision_date' || cat === 'offer_acceptance') {
    return prefs.applicationDeadlines;
  }
  return prefs.examinations;
}

export function dispatchDueBrowserNotifications(deadlines: DeadlineItem[], prefs: NotificationPrefs): number {
  if (!prefs.enabled || !isBrowserNotificationSupported() || Notification.permission !== 'granted') {
    return 0;
  }

  const todayKey = getIstDateKey(new Date());
  let sentMap: Record<string, string> = {};
  try {
    sentMap = JSON.parse(window.localStorage.getItem(SENT_KEY) || '{}') as Record<string, string>;
  } catch {
    sentMap = {};
  }

  let sentCount = 0;
  for (const dl of deadlines) {
    if (!categoryAllowed(dl.category, prefs)) continue;
    const cd = calculateIstCountdown(dl.date);
    if (cd.daysRemaining === null || cd.daysRemaining < 0 || cd.daysRemaining > prefs.leadDays) continue;

    const dedupeKey = `${dl.id}:${todayKey}`;
    if (sentMap[dedupeKey]) continue;

    new Notification(`[${cd.label}] ${dl.entity_name}`, {
      body: `${dl.title} (${cd.istDateDisplay}) · ${dl.verification_status.toUpperCase()}`
    });
    sentMap[dedupeKey] = new Date().toISOString();
    sentCount++;
    if (sentCount >= 3) break; // Cap per load to prevent notification spam
  }

  if (sentCount > 0) {
    try {
      window.localStorage.setItem(SENT_KEY, JSON.stringify(sentMap));
    } catch {
      // Ignore storage errors
    }
  }
  return sentCount;
}
