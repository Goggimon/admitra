import type { AdmissionsDatabase, EventsDatabase } from '../../../../monitoring/sources';

export interface UniversityItem {
  id: string;
  official_name: string;
  country: string;
  region: string;
  official_url: string;
  admissions_url: string;
  portal_url: string;
  program_name: string;
  monitoring_status: 'active' | 'paused';
  verification_status: 'verified' | 'announced' | 'unverified';
  application_status: string;
  last_verified_at: string | null;
}

export interface ExaminationItem {
  id: string;
  short_code: string;
  official_name: string;
  authority: string;
  official_url: string;
  notices_url: string;
  registration_state: string;
  monitoring_status: 'active' | 'paused';
  verification_status: 'verified' | 'announced' | 'unverified';
  last_verified_at: string | null;
}

export interface AdmitraBundle {
  universities: UniversityItem[];
  examinations: ExaminationItem[];
  admissions: AdmissionsDatabase;
  events: EventsDatabase;
}

export function getPublicAssetUrl(relativePath: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const cleanRel = relativePath.replace(/^\/+/, '');
  return `${normalizedBase}${cleanRel}`;
}

export function getAbsoluteCalendarUrl(): string {
  return new URL(getPublicAssetUrl('calendar.ics'), window.location.href).toString();
}

async function fetchJson<T>(relativePath: string): Promise<T> {
  const url = `${getPublicAssetUrl(relativePath)}?t=${Date.now()}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to load ${relativePath} (HTTP ${res.status})`);
  }
  return (await res.json()) as T;
}

export async function loadAdmitraBundle(): Promise<AdmitraBundle> {
  const [universities, examinations, admissions, events] = await Promise.all([
    fetchJson<UniversityItem[]>('data/universities.json'),
    fetchJson<ExaminationItem[]>('data/examinations.json'),
    fetchJson<AdmissionsDatabase>('data/admissions.json'),
    fetchJson<EventsDatabase>('data/events.json')
  ]);
  return { universities, examinations, admissions, events };
}
