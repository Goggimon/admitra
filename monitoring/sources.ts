export type VerificationStatus = 'verified' | 'announced' | 'unverified';
export type EntityType = 'university' | 'examination';

export interface VerificationHistory {
  last_successful_check: string | null;
  last_detected_change: string | null;
  previous_verified_date: string | null;
  current_verified_date: string | null;
}

export interface MonitoredSource {
  source_id: string;
  entity_type: EntityType;
  entity_id: string;
  entity_name: string;
  title: string;
  url: string;
  adapter: 'unsw_intl_admissions' | 'jee_main_public_notices' | 'generic_static_html';
  active: boolean;
  http_status: string | null;
  content_hash: string | null;
  last_excerpt: string;
  consecutive_failures: number;
  last_error: string | null;
  verification_history: VerificationHistory;
}

export interface DeadlineItem {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  entity_name: string;
  category: 'application_deadline' | 'registration_deadline' | 'exam_date' | 'result_date' | 'scholarship_deadline';
  title: string;
  date: string; // YYYY-MM-DD for date_only, or ISO string
  date_only: boolean;
  original_timezone: string;
  verification_status: VerificationStatus;
  source_url: string;
  verification_history: VerificationHistory;
}

export interface AdmissionsDatabase {
  schema_version: string;
  generated_at: string;
  timezone: string;
  sources: MonitoredSource[];
  deadlines: DeadlineItem[];
}

export interface TimelineEvent {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  entity_name: string;
  event_type: string;
  title: string;
  date: string;
  date_only: boolean;
  verification_status: VerificationStatus;
  source_url: string;
  evidence: string;
  detected_at: string;
}

export interface MonitoringRunSummary {
  started_at: string;
  finished_at: string;
  duration_ms: number;
  sources_checked: number;
  sources_failed: number;
  changes_detected: number;
}

export interface EventsDatabase {
  last_run: MonitoringRunSummary | null;
  events: TimelineEvent[];
}
