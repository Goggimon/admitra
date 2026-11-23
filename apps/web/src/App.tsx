import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  getAbsoluteCalendarUrl,
  getPublicAssetUrl,
  loadAdmitraBundle,
  type AdmitraBundle,
  type ExaminationItem,
  type UniversityItem
} from './api/dataClient';
import { calculateIstCountdown, formatIstDateTime } from './utils/countdown';
import {
  dispatchDueBrowserNotifications,
  isBrowserNotificationSupported,
  loadNotificationPrefs,
  requestNotificationPermission,
  saveNotificationPrefs,
  sendTestNotification,
  type NotificationPrefs
} from './utils/notifications';

type NavTab = 'overview' | 'universities' | 'examinations' | 'timeline' | 'settings';
type DeadlineFilter = 'all' | 'applications' | 'scholarships' | 'exams' | 'supplementary';

const NAV_ITEMS: Array<{ id: NavTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'universities', label: 'Universities' },
  { id: 'examinations', label: 'Examinations' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'settings', label: 'Calendar & Alerts' }
];

function verificationBadgeClass(status: string): string {
  if (status === 'verified') return 'badge badge-ok';
  if (status === 'announced') return 'badge badge-amber';
  return 'badge badge-muted';
}

function countdownBadgeClass(urgency: string): string {
  if (urgency === 'overdue') return 'badge badge-muted';
  if (urgency === 'today' || urgency === 'critical') return 'badge badge-critical';
  if (urgency === 'soon') return 'badge badge-high';
  if (urgency === 'upcoming') return 'badge badge-amber';
  return 'badge badge-muted';
}

function appStatusBadgeClass(status: string): string {
  if (status === 'open' || status === 'open_late_fee') return 'badge badge-ok';
  if (status === 'opening_soon' || status === 'announced' || status === 'upcoming') return 'badge badge-amber';
  return 'badge badge-muted';
}

function formatMonthHeading(yyyyMmDd: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(yyyyMmDd);
  if (!m) return 'Upcoming';
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(dt);
}

export function App() {
  const [tab, setTab] = useState<NavTab>('overview');
  const [bundle, setBundle] = useState<AdmitraBundle | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  // Overview state
  const [deadlineFilter, setDeadlineFilter] = useState<DeadlineFilter>('all');
  const [showAllOverviewDeadlines, setShowAllOverviewDeadlines] = useState<boolean>(false);
  const [showMonitoringDetails, setShowMonitoringDetails] = useState<boolean>(false);

  // Universities state
  const [uniSearch, setUniSearch] = useState<string>('');
  const [regionFilter, setRegionFilter] = useState<string>('ALL');
  const [eceFilter, setEceFilter] = useState<'all' | 'genuine' | 'pathway'>('all');
  const [expandedUniId, setExpandedUniId] = useState<string | null>(null);

  // Examinations state
  const [examSubTab, setExamSubTab] = useState<'entrance' | 'supplementary'>('entrance');
  const [expandedExamId, setExpandedExamId] = useState<string | null>('exam_jeem');

  // Timeline state
  const [timelineStatusFilter, setTimelineStatusFilter] = useState<'all' | 'verified' | 'announced' | 'unverified'>('all');
  const [hidePastTimeline, setHidePastTimeline] = useState<boolean>(true);

  // Notifications state
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(() => loadNotificationPrefs());
  const [notifStatusMsg, setNotifStatusMsg] = useState<string>('');
  const [showEmailSetup, setShowEmailSetup] = useState<boolean>(false);

  const reload = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await loadAdmitraBundle();
      setBundle(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    if (bundle && notifPrefs.enabled) {
      dispatchDueBrowserNotifications(bundle.admissions.deadlines, notifPrefs);
    }
  }, [bundle, notifPrefs]);

  const updatePrefs = (next: NotificationPrefs) => {
    setNotifPrefs(next);
    saveNotificationPrefs(next);
  };

  const handleToggleBrowserPush = async () => {
    if (!isBrowserNotificationSupported()) {
      setNotifStatusMsg('Browser Notifications API is not supported in this browser.');
      return;
    }
    if (!notifPrefs.enabled) {
      const perm = await requestNotificationPermission();
      if (perm === 'granted') {
        updatePrefs({ ...notifPrefs, enabled: true });
        setNotifStatusMsg('Browser push alerts enabled.');
      } else {
        setNotifStatusMsg(`Permission ${perm}. Enable notifications in browser site settings.`);
      }
    } else {
      updatePrefs({ ...notifPrefs, enabled: false });
      setNotifStatusMsg('Browser push alerts paused.');
    }
  };

  const allDeadlines = useMemo(() => {
    if (!bundle) return [];
    return [...bundle.admissions.deadlines]
      .map((d) => ({ ...d, countdown: calculateIstCountdown(d.date) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [bundle]);

  const activeDeadlines = useMemo(
    () => allDeadlines.filter((d) => (d.countdown.daysRemaining ?? -1) >= 0),
    [allDeadlines]
  );

  const filteredOverviewDeadlines = useMemo(() => {
    return activeDeadlines.filter((d) => {
      if (deadlineFilter === 'all') return true;
      if (deadlineFilter === 'applications') {
        return d.category === 'application_opening' || d.category === 'application_deadline' || d.category === 'offer_acceptance' || d.category === 'decision_date';
      }
      if (deadlineFilter === 'scholarships') {
        return d.category === 'scholarship_opening' || d.category === 'scholarship_deadline';
      }
      if (deadlineFilter === 'exams') return d.entity_type === 'examination';
      return d.entity_type === 'supplementary';
    });
  }, [activeDeadlines, deadlineFilter]);

  const openUniversities = useMemo(
    () => (bundle?.universities ?? []).filter((u) => u.application_status === 'open'),
    [bundle]
  );
  const openingSoonUniversities = useMemo(
    () => (bundle?.universities ?? []).filter((u) => u.application_status === 'opening_soon'),
    [bundle]
  );
  const scholarshipCount = useMemo(
    () => activeDeadlines.filter((d) => d.category === 'scholarship_deadline' || d.category === 'scholarship_opening').length,
    [activeDeadlines]
  );

  const regions = useMemo(() => {
    const set = new Set((bundle?.universities ?? []).map((u) => u.region));
    return ['ALL', ...Array.from(set)];
  }, [bundle]);

  const filteredUniversities = useMemo(() => {
    const q = uniSearch.trim().toLowerCase();
    return (bundle?.universities ?? []).filter((u) => {
      if (regionFilter !== 'ALL' && u.region !== regionFilter) return false;
      if (eceFilter === 'genuine' && !u.programme?.genuine_ece) return false;
      if (eceFilter === 'pathway' && u.programme?.genuine_ece) return false;
      if (q) {
        const hay = `${u.official_name} ${u.country} ${u.program_name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [bundle, regionFilter, eceFilter, uniSearch]);

  const groupedTimeline = useMemo(() => {
    if (!bundle) return [];
    const items = bundle.admissions.deadlines
      .map((d) => ({
        id: d.id,
        kind: d.category.replace(/_/g, ' '),
        entityName: d.entity_name,
        title: d.title,
        date: d.date,
        verification: d.verification_status,
        sourceUrl: d.source_url,
        timezone: d.original_timezone,
        countdown: calculateIstCountdown(d.date)
      }))
      .filter((item) => {
        if (timelineStatusFilter !== 'all' && item.verification !== timelineStatusFilter) return false;
        if (hidePastTimeline && (item.countdown.daysRemaining ?? 0) < 0) return false;
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const groups = new Map<string, typeof items>();
    for (const item of items) {
      const month = formatMonthHeading(item.date);
      const list = groups.get(month) ?? [];
      list.push(item);
      groups.set(month, list);
    }
    return Array.from(groups.entries());
  }, [bundle, timelineStatusFilter, hidePastTimeline]);

  const calendarSubUrl = useMemo(() => getAbsoluteCalendarUrl(), []);
  const calendarDownloadHref = useMemo(() => getPublicAssetUrl('calendar.ics'), []);

  const copySubscriptionUrl = async () => {
    try {
      await navigator.clipboard.writeText(calendarSubUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const nextDeadline = activeDeadlines[0] ?? null;
  const lastRun = bundle?.events.last_run ?? null;
  const visibleOverviewDeadlines = showAllOverviewDeadlines
    ? filteredOverviewDeadlines
    : filteredOverviewDeadlines.slice(0, 8);

  const renderUniversityDetails = (u: UniversityItem) => (
    <tr className="detail-row">
      <td colSpan={5}>
        <div className="detail-grid">
          <div className="detail-card">
            <div className="detail-title">Programme &amp; ECE Fit</div>
            <div><strong>Programme:</strong> {u.programme?.official_name ?? u.program_name}</div>
            <div><strong>Degree:</strong> {u.programme?.degree_type} · {u.programme?.duration}</div>
            <div><strong>Campus:</strong> {u.programme?.campus}</div>
            <div style={{ marginTop: 6 }}><strong>ECE Check:</strong> {u.programme?.ece_notes}</div>
            {u.programme?.ai_alternative_name && (
              <div style={{ marginTop: 6 }}>
                <strong>AI Alternative:</strong>{' '}
                <a className="link-accent" href={u.programme.ai_alternative_url} target="_blank" rel="noreferrer">
                  {u.programme.ai_alternative_name} ↗
                </a>
              </div>
            )}
          </div>

          <div className="detail-card">
            <div className="detail-title">Eligibility (CBSE Class 12)</div>
            <div><strong>Minimum Overall:</strong> {u.eligibility?.min_overall_percentage}</div>
            <div><strong>Maths / Physics:</strong> {u.eligibility?.pcm_requirements}</div>
            <div><strong>SAT Policy:</strong> {u.eligibility?.sat_requirement}</div>
            <div><strong>English:</strong> {u.eligibility?.english_proficiency}</div>
            <div><strong>CBSE Waiver:</strong> {u.eligibility?.cbse_english_exemption}</div>
          </div>

          <div className="detail-card">
            <div className="detail-title">Application (2027)</div>
            <div><strong>Target Intake:</strong> {u.application?.intake_target}</div>
            <div><strong>Fee:</strong> {u.application?.fee}</div>
            <div><strong>Documents:</strong> {u.application?.required_documents}</div>
            <div><strong>Essays / LORs:</strong> {u.application?.essays_sop} · {u.application?.recommendation_letters}</div>
            <div><strong>Interviews:</strong> {u.application?.interviews_portfolios}</div>
          </div>

          <div className="detail-card">
            <div className="detail-title">Tuition &amp; Scholarships</div>
            <div><strong>Annual Tuition:</strong> {u.financial?.tuition_annual}</div>
            <div><strong>Other Fees:</strong> {u.financial?.additional_fees}</div>
            {(u.financial?.scholarships ?? []).map((s, idx) => (
              <div key={idx} style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>
                <a className="link-accent" href={s.url} target="_blank" rel="noreferrer">{s.name} ↗</a>
                <div>{s.amount}</div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Deadline: {s.deadline ?? 'Auto / TBA'} · {s.eligibility}
                </div>
              </div>
            ))}
          </div>
        </div>
      </td>
    </tr>
  );

  const renderExamDetails = (ex: ExaminationItem) => (
    <tr className="detail-row">
      <td colSpan={5}>
        <div className="detail-grid">
          <div className="detail-card">
            <div className="detail-title">Eligibility &amp; ECE Admissions</div>
            <div><strong>Fee:</strong> {ex.application_fee ?? 'Not yet announced'}</div>
            <div style={{ marginTop: 4 }}><strong>Eligibility:</strong> {ex.eligibility}</div>
            <div style={{ marginTop: 4 }}><strong>ECE / AI Seats:</strong> {ex.ece_admission_info}</div>
            <div style={{ marginTop: 4 }}>
              <strong>Counselling:</strong>{' '}
              {ex.counselling_portal ? (
                <a className="link-accent" href={ex.counselling_portal} target="_blank" rel="noreferrer">Portal ↗</a>
              ) : 'TBA'}{' '}
              ({ex.counselling_dates ?? ex.counselling_estimate ?? 'TBA'})
            </div>
          </div>
          <div className="detail-card">
            <div className="detail-title">2027 Sessions &amp; Phases</div>
            {(ex.sessions ?? []).map((s, idx) => (
              <div key={idx} style={{ marginBottom: 10, paddingBottom: 8, borderBottom: idx < (ex.sessions?.length ?? 1) - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <strong>{s.name}</strong>
                  <span className={verificationBadgeClass(s.verification_status)}>
                    {s.verification_status}{s.is_estimate ? ' · est' : ''}
                  </span>
                </div>
                <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 4 }}>
                  Reg: {s.reg_open ?? 'TBA'} → {s.reg_close ?? 'TBA'}{s.late_reg_close ? ` (Late ${s.late_reg_close})` : ''}
                </div>
                <div className="mono" style={{ fontSize: 11.5, color: 'var(--accent)' }}>
                  Exam: {s.exam_dates ?? 'Not yet announced'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                  {s.notes} · <a className="link-accent" href={s.source_url} target="_blank" rel="noreferrer">Source ↗</a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </td>
    </tr>
  );

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-title">ADMITRA</div>
          <div className="brand-sub">Fall 2027 · ECE &amp; AI</div>
        </div>

        <nav className="nav-list">
          {NAV_ITEMS.map((item) => {
            const count =
              item.id === 'universities'
                ? bundle?.universities.length
                : item.id === 'examinations'
                ? (bundle ? `${bundle.examinations.length}+${bundle.supplementary.length}` : undefined)
                : item.id === 'timeline'
                ? activeDeadlines.length
                : undefined;
            return (
              <button
                key={item.id}
                type="button"
                className={`nav-btn ${tab === item.id ? 'active' : ''}`}
                onClick={() => setTab(item.id)}
              >
                <span>{item.label}</span>
                {count !== undefined ? <span className="nav-count">{count}</span> : null}
              </button>
            );
          })}
        </nav>

        {bundle && (
          <div className="sidebar-footer">
            <div><strong>{bundle.profile.nationality} · {bundle.profile.qualification}</strong></div>
            <div>{bundle.profile.subjects.join(' · ')}</div>
            <div style={{ marginTop: 4 }}>Target: {bundle.profile.target_entry}</div>
          </div>
        )}
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <div className="page-title">{NAV_ITEMS.find((n) => n.id === tab)?.label}</div>
            <div className="page-sub mono">
              {bundle
                ? `Synced ${formatIstDateTime(bundle.admissions.generated_at)} · Asia/Kolkata`
                : 'Loading admissions database...'}
            </div>
          </div>
          <div className="actions-row">
            <a className="btn btn-primary" href={calendarDownloadHref} download="admitra-calendar.ics">
              Export .ics Calendar
            </a>
            <button type="button" className="btn" disabled={loading} onClick={() => void reload()}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </header>

        {error ? <div className="banner-error">Load Error: {error}</div> : null}

        {tab === 'overview' && bundle && (
          <>
            <section className="metrics-grid">
              <div className="metric-card">
                <div className="metric-label">Next Deadline</div>
                <div className="metric-value" style={{ color: 'var(--danger)' }}>
                  {nextDeadline ? nextDeadline.countdown.label : '—'}
                </div>
                <div className="metric-foot">
                  {nextDeadline ? `${nextDeadline.entity_name} · ${nextDeadline.countdown.istDateDisplay}` : 'All clear'}
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Open Applications</div>
                <div className="metric-value" style={{ color: 'var(--ok)' }}>
                  {openUniversities.length}
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)' }}> / 18</span>
                </div>
                <div className="metric-foot">{openingSoonUniversities.length} opening soon (Kyushu, Aalto, Oulu)</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Upcoming Scholarships</div>
                <div className="metric-value" style={{ color: 'var(--accent)' }}>{scholarshipCount}</div>
                <div className="metric-foot">UNSW, Manchester, Sheffield, TCD, UCD</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Entrance Exams</div>
                <div className="metric-value">8 <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)' }}>+ SAT &amp; CBSE</span></div>
                <div className="metric-foot">JEE Main S1/S2 &amp; CBSE 2027 verified</div>
              </div>
            </section>

            {openingSoonUniversities.length > 0 && (
              <>
                <div className="month-heading">Opening Soon — Strict Windows</div>
                <section className="spotlight-grid">
                  {openingSoonUniversities.map((u) => {
                    const cd = calculateIstCountdown(u.application?.opening_date);
                    return (
                      <div key={u.id} className="spotlight-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="badge badge-amber">Opens {cd.istDateDisplay}</span>
                          <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.country}</span>
                        </div>
                        <div style={{ fontWeight: 600, fontSize: 14.5 }}>{u.official_name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{u.program_name}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 8 }}>
                          <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            Closes {u.application?.deadline ?? 'TBA'}
                          </span>
                          <a className="link-accent" style={{ fontSize: 12 }} href={u.portal_url} target="_blank" rel="noreferrer">
                            Portal ↗
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </section>
              </>
            )}

            <section className="panel">
              <div className="panel-header">
                <span className="panel-title">Priority Radar — Upcoming Deadlines</span>
                <div className="pill-row">
                  {(['all', 'applications', 'scholarships', 'exams', 'supplementary'] as DeadlineFilter[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={`pill ${deadlineFilter === f ? 'active' : ''}`}
                      onClick={() => setDeadlineFilter(f)}
                    >
                      {f === 'supplementary' ? 'SAT & CBSE' : f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 120 }}>Countdown</th>
                      <th style={{ width: 120 }}>Date (IST)</th>
                      <th>Milestone</th>
                      <th style={{ width: 110 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleOverviewDeadlines.map((dl) => (
                      <tr key={dl.id}>
                        <td><span className={countdownBadgeClass(dl.countdown.urgency)}>{dl.countdown.label}</span></td>
                        <td className="mono" style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{dl.countdown.istDateDisplay}</td>
                        <td>
                          <a href={dl.source_url} target="_blank" rel="noreferrer" style={{ fontWeight: 500 }}>{dl.title}</a>
                          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                            {dl.entity_name} · {dl.category.replace(/_/g, ' ')}
                          </div>
                        </td>
                        <td><span className={verificationBadgeClass(dl.verification_status)}>{dl.verification_status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredOverviewDeadlines.length > 8 && (
                <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Showing {visibleOverviewDeadlines.length} of {filteredOverviewDeadlines.length} upcoming milestones
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn-ghost btn" onClick={() => setShowAllOverviewDeadlines((v) => !v)}>
                      {showAllOverviewDeadlines ? 'Show fewer' : 'Show all'}
                    </button>
                    <button type="button" className="btn-ghost btn" onClick={() => setTab('timeline')}>
                      Full Timeline →
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section className="panel">
              <div className="health-bar" onClick={() => setShowMonitoringDetails((v) => !v)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="dot dot-ok" />
                  <span style={{ fontWeight: 500, fontSize: 13 }}>
                    Daily Monitoring Active · {bundle.admissions.sources.length} official sources
                  </span>
                  <span className="mono" style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                    ({lastRun?.sources_failed ?? 0} failures · last check {formatIstDateTime(lastRun?.finished_at)})
                  </span>
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {showMonitoringDetails ? 'Hide sources ▴' : 'Inspect sources ▾'}
                </span>
              </div>
              {showMonitoringDetails && (
                <div className="table-wrap" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Official Source</th>
                        <th>HTTP</th>
                        <th>Last Verified</th>
                        <th>Failures</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bundle.admissions.sources.map((src) => (
                        <tr key={src.source_id}>
                          <td><a href={src.url} target="_blank" rel="noreferrer">{src.title}</a></td>
                          <td className="mono">{src.http_status || 'PENDING'}</td>
                          <td className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {formatIstDateTime(src.verification_history.last_successful_check)}
                          </td>
                          <td className="mono">{src.consecutive_failures}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {tab === 'universities' && bundle && (
          <section className="panel">
            <div className="panel-header">
              <input
                className="input"
                style={{ maxWidth: 260 }}
                type="text"
                placeholder="Search 18 universities or programmes..."
                value={uniSearch}
                onChange={(e) => setUniSearch(e.target.value)}
              />
              <div className="pill-row">
                {regions.map((r) => (
                  <button key={r} type="button" className={`pill ${regionFilter === r ? 'active' : ''}`} onClick={() => setRegionFilter(r)}>
                    {r}
                  </button>
                ))}
                <button
                  type="button"
                  className={`pill ${eceFilter === 'genuine' ? 'active' : ''}`}
                  onClick={() => setEceFilter(eceFilter === 'genuine' ? 'all' : 'genuine')}
                >
                  Genuine ECE only
                </button>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>University</th>
                    <th>Target Programme</th>
                    <th>Status &amp; Deadline</th>
                    <th>ECE Fit</th>
                    <th style={{ width: 90 }}>Apply</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUniversities.map((u) => {
                    const isOpen = expandedUniId === u.id;
                    return (
                      <Fragment key={u.id}>
                        <tr className="clickable-row" onClick={() => setExpandedUniId(isOpen ? null : u.id)}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{isOpen ? '▾ ' : '▸ '}{u.official_name}</div>
                            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{u.country}</div>
                          </td>
                          <td style={{ color: 'var(--text-secondary)' }}>{u.program_name}</td>
                          <td>
                            <span className={appStatusBadgeClass(u.application_status)}>{u.application_status.replace(/_/g, ' ')}</span>
                            <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3 }}>
                              {u.application?.deadline ?? 'Rolling / TBA'}
                            </div>
                          </td>
                          <td>
                            <span className={u.programme?.genuine_ece ? 'badge badge-ok' : 'badge badge-amber'}>
                              <span className={u.programme?.genuine_ece ? 'dot dot-ok' : 'dot dot-amber'} />
                              {u.programme?.genuine_ece ? 'ECE' : 'Pathway'}
                            </span>
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <a className="link-accent" href={u.portal_url} target="_blank" rel="noreferrer">Portal ↗</a>
                          </td>
                        </tr>
                        {isOpen && renderUniversityDetails(u)}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'examinations' && bundle && (
          <>
            <div className="segmented">
              <button
                type="button"
                className={`seg-btn ${examSubTab === 'entrance' ? 'active' : ''}`}
                onClick={() => setExamSubTab('entrance')}
              >
                Indian Entrance Exams (8)
              </button>
              <button
                type="button"
                className={`seg-btn ${examSubTab === 'supplementary' ? 'active' : ''}`}
                onClick={() => setExamSubTab('supplementary')}
              >
                SAT &amp; CBSE Class 12 Boards (2)
              </button>
            </div>

            {examSubTab === 'entrance' ? (
              <section className="panel">
                <div className="panel-header">
                  <span className="panel-title">8 Shortlisted Entrance Examinations (Click Any Row for Sessions)</span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    JEE Main &amp; BITSAT sessions tracked independently
                  </span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Examination</th>
                        <th>Authority</th>
                        <th>State</th>
                        <th>Verification</th>
                        <th style={{ width: 100 }}>Portal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bundle.examinations.map((ex) => {
                        const isOpen = expandedExamId === ex.id;
                        return (
                          <Fragment key={ex.id}>
                            <tr className="clickable-row" onClick={() => setExpandedExamId(isOpen ? null : ex.id)}>
                              <td>
                                <div style={{ fontWeight: 600 }}>{isOpen ? '▾ ' : '▸ '}{ex.official_name}</div>
                                <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ex.short_code}</div>
                              </td>
                              <td style={{ color: 'var(--text-secondary)' }}>{ex.authority}</td>
                              <td><span className={appStatusBadgeClass(ex.registration_state)}>{ex.registration_state.replace(/_/g, ' ')}</span></td>
                              <td><span className={verificationBadgeClass(ex.verification_status)}>{ex.verification_status}</span></td>
                              <td onClick={(e) => e.stopPropagation()}>
                                <a className="link-accent" href={ex.registration_url ?? ex.official_url} target="_blank" rel="noreferrer">Register ↗</a>
                              </td>
                            </tr>
                            {isOpen && renderExamDetails(ex)}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : (
              bundle.supplementary.map((supp) => (
                <section key={supp.id} className="panel">
                  <div className="panel-header">
                    <div>
                      <div className="panel-title">{supp.official_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{supp.authority}{supp.fees_india ? ` · ${supp.fees_india}` : ''}</div>
                    </div>
                    <div className="actions-row">
                      <span className={verificationBadgeClass(supp.verification_status)}>{supp.verification_status}</span>
                      <a className="link-accent" style={{ fontSize: 12.5 }} href={supp.official_url} target="_blank" rel="noreferrer">Official ↗</a>
                    </div>
                  </div>
                  <div className="table-wrap">
                    {supp.test_dates && (
                      <table>
                        <thead>
                          <tr>
                            <th>Test Date</th>
                            <th>Regular Reg</th>
                            <th>Late Reg</th>
                            <th>Score Release</th>
                            <th>Key Note</th>
                          </tr>
                        </thead>
                        <tbody>
                          {supp.test_dates.map((t, i) => (
                            <tr key={i}>
                              <td className="mono" style={{ fontWeight: 600 }}>{t.test_date}</td>
                              <td className="mono">{t.regular_reg_deadline}</td>
                              <td className="mono">{t.late_reg_deadline}</td>
                              <td className="mono">{t.score_release_date}</td>
                              <td style={{ color: 'var(--text-secondary)' }}>{t.notes}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {supp.milestones && (
                      <table>
                        <thead>
                          <tr>
                            <th>Subject / Milestone</th>
                            <th>Date (IST)</th>
                            <th>Status</th>
                            <th>Source</th>
                          </tr>
                        </thead>
                        <tbody>
                          {supp.milestones.map((m, i) => (
                            <tr key={i}>
                              <td>{m.label}{m.time_ist ? ` (${m.time_ist})` : ''}</td>
                              <td className="mono" style={{ fontWeight: 500 }}>{m.date ?? 'Not yet announced'}</td>
                              <td><span className={verificationBadgeClass(m.verification_status)}>{m.verification_status}{m.is_estimate ? ' · est' : ''}</span></td>
                              <td><a className="link-accent" href={m.source_url} target="_blank" rel="noreferrer">PDF ↗</a></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  <div className="panel-body" style={{ borderTop: '1px solid var(--border-subtle)', fontSize: 12.5, color: 'var(--text-secondary)' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>University Dependencies</strong>
                    <ul style={{ marginLeft: 18, marginTop: 6, lineHeight: 1.7 }}>
                      {supp.university_dependencies.map((dep, i) => <li key={i}>{dep}</li>)}
                    </ul>
                  </div>
                </section>
              ))
            )}
          </>
        )}

        {tab === 'timeline' && bundle && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
              <div className="pill-row">
                {(['all', 'verified', 'announced', 'unverified'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    className={`pill ${timelineStatusFilter === st ? 'active' : ''}`}
                    onClick={() => setTimelineStatusFilter(st)}
                  >
                    {st === 'all' ? 'All Statuses' : st.charAt(0).toUpperCase() + st.slice(1)}
                  </button>
                ))}
              </div>
              <button type="button" className={`pill ${hidePastTimeline ? 'active' : ''}`} onClick={() => setHidePastTimeline((v) => !v)}>
                {hidePastTimeline ? 'Hiding past dates' : 'Showing all dates'}
              </button>
            </div>

            {groupedTimeline.map(([month, items]) => (
              <div key={month} className="month-group">
                <div className="month-heading">{month}</div>
                <section className="panel">
                  <div className="table-wrap">
                    <table>
                      <tbody>
                        {items.map((item) => (
                          <tr key={item.id}>
                            <td className="mono" style={{ width: 120, color: 'var(--text-secondary)', fontSize: 12 }}>{item.countdown.istDateDisplay}</td>
                            <td style={{ width: 120 }}><span className={countdownBadgeClass(item.countdown.urgency)}>{item.countdown.label}</span></td>
                            <td>
                              <a href={item.sourceUrl} target="_blank" rel="noreferrer" style={{ fontWeight: 500 }}>{item.title}</a>
                              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                                {item.entityName} · {item.kind} · {item.timezone}
                              </div>
                            </td>
                            <td style={{ width: 105, textAlign: 'right' }}>
                              <span className={verificationBadgeClass(item.verification)}>{item.verification}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            ))}
          </>
        )}

        {tab === 'settings' && bundle && (
          <div className="settings-grid">
            <section className="panel">
              <div className="panel-header">
                <span className="panel-title">Calendar Sync (.ics — Recommended)</span>
                <span className="badge badge-ok">7d &amp; 1d Alerts</span>
              </div>
              <div className="panel-body">
                <p style={{ color: 'var(--text-secondary)', marginBottom: 14 }}>
                  Subscribe to this live <span className="mono">calendar.ics</span> URL in Apple Calendar, Google Calendar, or Samsung Calendar for automatic native reminders — no email setup needed.
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                  <input className="input" type="text" readOnly value={calendarSubUrl} />
                  <button type="button" className="btn" onClick={() => void copySubscriptionUrl()}>
                    {copied ? 'Copied' : 'Copy URL'}
                  </button>
                  <a className="btn btn-primary" href={calendarDownloadHref} download="admitra-calendar.ics">
                    Download .ics
                  </a>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                  <div>• <strong>Apple Calendar:</strong> File → New Calendar Subscription → paste URL</div>
                  <div>• <strong>Google Calendar:</strong> Other calendars (+) → From URL → paste URL</div>
                  <div>• <strong>Samsung Calendar:</strong> Syncs automatically via your Google account</div>
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <span className="panel-title">Browser Push Notifications</span>
                <span className={notifPrefs.enabled ? 'badge badge-ok' : 'badge badge-muted'}>
                  {notifPrefs.enabled ? 'Active' : 'Off'}
                </span>
              </div>
              <div className="panel-body">
                <p style={{ color: 'var(--text-secondary)', marginBottom: 14 }}>
                  Optional desktop browser alerts when you open ADMITRA (deduplicated daily to prevent spam).
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
                  <button type="button" className="btn btn-primary" onClick={() => void handleToggleBrowserPush()}>
                    {notifPrefs.enabled ? 'Disable Alerts' : 'Enable Browser Alerts'}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={!notifPrefs.enabled}
                    onClick={() => {
                      const ok = sendTestNotification();
                      setNotifStatusMsg(ok ? 'Test notification sent.' : 'Enable browser alerts first.');
                    }}
                  >
                    Test Alert
                  </button>
                  <select
                    className="btn"
                    value={notifPrefs.leadDays}
                    onChange={(e) => updatePrefs({ ...notifPrefs, leadDays: Number(e.target.value) })}
                  >
                    <option value={3}>3 days before</option>
                    <option value={7}>7 days before</option>
                    <option value={14}>14 days before</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-secondary)' }}>
                  <label><input type="checkbox" checked={notifPrefs.applicationDeadlines} onChange={(e) => updatePrefs({ ...notifPrefs, applicationDeadlines: e.target.checked })} /> Applications</label>
                  <label><input type="checkbox" checked={notifPrefs.scholarships} onChange={(e) => updatePrefs({ ...notifPrefs, scholarships: e.target.checked })} /> Scholarships</label>
                  <label><input type="checkbox" checked={notifPrefs.examinations} onChange={(e) => updatePrefs({ ...notifPrefs, examinations: e.target.checked })} /> Exams &amp; Boards</label>
                </div>
                {notifStatusMsg && <div style={{ fontSize: 12, color: 'var(--accent)', marginTop: 10 }}>{notifStatusMsg}</div>}
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <span className="panel-title">Student Profile</span>
                <span className="badge badge-muted">Scores Blank</span>
              </div>
              <div className="panel-body" style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.75 }}>
                <div><strong style={{ color: 'var(--text-primary)' }}>Applicant:</strong> {bundle.profile.nationality} · {bundle.profile.qualification}</div>
                <div><strong style={{ color: 'var(--text-primary)' }}>Subjects:</strong> {bundle.profile.subjects.join(', ')}</div>
                <div><strong style={{ color: 'var(--text-primary)' }}>Primary Target:</strong> {bundle.profile.primary_discipline}</div>
                <div><strong style={{ color: 'var(--text-primary)' }}>Alternative:</strong> {bundle.profile.alternative_discipline}</div>
                <div><strong style={{ color: 'var(--text-primary)' }}>Scores / SAT / Predicted:</strong> Intentionally left blank</div>
              </div>
            </section>

            <section className="panel">
              <div className="panel-header" style={{ cursor: 'pointer' }} onClick={() => setShowEmailSetup((v) => !v)}>
                <span className="panel-title">Optional: GitHub Actions Email Alerts</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{showEmailSetup ? 'Hide ▴' : 'Details ▾'}</span>
              </div>
              <div className="panel-body" style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                <p>Completely optional — if you use the <span className="mono">.ics</span> calendar above, you don't need to configure email alerts.</p>
                {showEmailSetup && (
                  <div className="mono" style={{ marginTop: 10, fontSize: 11.5, lineHeight: 1.7, color: 'var(--text-muted)' }}>
                    <div>Only sends an email if a deadline changes or hits 7d / 3d / 1d / 0d left.</div>
                    <div>Optional GitHub Secrets: RESEND_API_KEY + NOTIFY_EMAIL</div>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
