import type { AdmissionsDatabase, EventsDatabase, VerificationStatus } from '../../../../monitoring/sources';

export interface StudentProfile {
  nationality: string;
  qualification: string;
  subjects: string[];
  admission_level: string;
  target_entry: string;
  primary_discipline: string;
  alternative_discipline: string;
  international_applicant: boolean;
  standardized_testing: string[];
  shortlist_counts: {
    universities: number;
    indian_entrance_examinations: number;
    supplementary_requirements: number;
  };
  academic_scores: {
    class_10_percentage: number | null;
    class_11_percentage: number | null;
    predicted_class_12_grades: string | null;
    final_class_12_grades: string | null;
  };
  test_scores: {
    sat_total: number | null;
    sat_math: number | null;
    sat_ebrw: number | null;
    english_proficiency_test: string | null;
    english_proficiency_score: string | null;
  };
  extracurriculars: string[];
  notes: string;
}

export interface UniversityScholarship {
  name: string;
  amount: string;
  eligibility: string;
  deadline: string | null;
  url: string;
}

export interface UniversityMilestone {
  label: string;
  date: string | null;
  is_estimate: boolean;
  verification_status: VerificationStatus;
  source_url: string;
}

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
  verification_status: VerificationStatus;
  application_status: string;
  last_verified_at: string | null;
  programme?: {
    official_name: string;
    degree_type: string;
    duration: string;
    campus: string;
    webpage_url: string;
    genuine_ece: boolean;
    ece_notes: string;
    ai_alternative_name: string;
    ai_alternative_url: string;
  };
  eligibility?: {
    cbse_accepted: boolean;
    min_overall_percentage: string;
    pcm_requirements: string;
    math_physics_prerequisites: string;
    sat_requirement: string;
    english_proficiency: string;
    cbse_english_exemption: string;
    india_conditions: string;
  };
  application?: {
    intake_target: string;
    opening_date: string | null;
    deadline: string | null;
    portal_name: string;
    portal_url: string;
    fee: string;
    required_documents: string;
    predicted_final_grades: string;
    essays_sop: string;
    recommendation_letters: string;
    extracurriculars: string;
    interviews_portfolios: string;
  };
  financial?: {
    tuition_annual: string;
    additional_fees: string;
    scholarships: UniversityScholarship[];
  };
  milestones?: UniversityMilestone[];
}

export interface ExamSession {
  name: string;
  reg_open: string | null;
  reg_close: string | null;
  late_reg_close: string | null;
  correction_window: string | null;
  city_intimation: string | null;
  admit_card: string | null;
  exam_dates: string | null;
  result_date: string | null;
  verification_status: VerificationStatus;
  is_estimate: boolean;
  notes: string;
  source_url: string;
}

export interface ExaminationItem {
  id: string;
  short_code: string;
  official_name: string;
  authority: string;
  official_url: string;
  notices_url: string;
  registration_url?: string;
  registration_state: string;
  monitoring_status: 'active' | 'paused';
  verification_status: VerificationStatus;
  last_verified_at: string | null;
  application_fee?: string | null;
  eligibility?: string;
  ece_admission_info?: string;
  counselling_portal?: string;
  counselling_dates?: string | null;
  counselling_estimate?: string;
  sessions?: ExamSession[];
}

export interface SupplementaryItem {
  id: string;
  short_code: string;
  official_name: string;
  authority: string;
  category: string;
  official_url: string;
  registration_url: string;
  datesheet_url?: string;
  fees_india?: string;
  verification_status: VerificationStatus;
  last_verified_at: string | null;
  test_dates?: Array<{
    label: string;
    test_date: string;
    regular_reg_deadline: string;
    late_reg_deadline: string;
    score_release_date: string;
    verification_status: VerificationStatus;
    notes: string;
    source_url: string;
  }>;
  milestones?: Array<{
    label: string;
    date: string | null;
    end_date?: string | null;
    time_ist?: string;
    verification_status: VerificationStatus;
    is_estimate: boolean;
    notes?: string;
    source_url: string;
  }>;
  university_dependencies: string[];
}

export interface AdmitraBundle {
  profile: StudentProfile;
  universities: UniversityItem[];
  examinations: ExaminationItem[];
  supplementary: SupplementaryItem[];
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
  const [profile, universities, examinations, supplementary, admissions, events] = await Promise.all([
    fetchJson<StudentProfile>('data/profile.json'),
    fetchJson<UniversityItem[]>('data/universities.json'),
    fetchJson<ExaminationItem[]>('data/examinations.json'),
    fetchJson<SupplementaryItem[]>('data/supplementary.json'),
    fetchJson<AdmissionsDatabase>('data/admissions.json'),
    fetchJson<EventsDatabase>('data/events.json')
  ]);
  return { profile, universities, examinations, supplementary, admissions, events };
}
