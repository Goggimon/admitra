import { useEffect, useMemo, useState } from 'react';
import {
  getAbsoluteCalendarUrl,
  getPublicAssetUrl,
  loadAdmitraBundle,
  type AdmitraBundle
} from './api/dataClient';
import { calculateIstCountdown, formatIstDateTime } from './utils/countdown';

type NavTab = 'overview' | 'universities' | 'examinations' | 'timeline' | 'settings';

const NAV_ITEMS: Array<{ id: NavTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'universities', label: 'Universities' },
  { id: 'examinations', label: 'Examinations' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'settings', label: 'Settings' }
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

export function App() {
  const [tab, setTab] = useState<NavTab>('overview');
  const [bundle, setBundle] = useState<AdmitraBundle | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

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

  const timelineItems = useMemo(() => {
    if (!bundle) return [];
    const fromDeadlines = bundle.admissions.deadlines.map((d) => ({
      id: d.id,
      kind: 'DEADLINE' as const,
      entityName: d.entity_name,
      title: d.title,
      date: d.date,
      verification: d.verification_status,
      sourceUrl: d.source_url,
      subtitle: `${d.category.replace(/_/g, ' ')} · ${d.original_timezone}`
    }));
    const fromEvents = bundle.events.events.map((e) => ({
      id: e.id,
      kind: 'EVENT' as const,
      entityName: e.entity_name,
      title: e.title,
      date: e.date,
      verification: e.verification_status,
      sourceUrl: e.source_url,
      subtitle: e.evidence
    }));
    return [...fromDeadlines, ...fromEvents].sort((a, b) => a.date.localeCompare(b.date));
  }, [bundle]);

  const upcomingDeadlines = useMemo(() => {
    if (!bundle) return [];
    return [...bundle.admissions.deadlines]
      .map((d) => ({ ...d, countdown: calculateIstCountdown(d.date) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [bundle]);

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

  const activeUnis = bundle?.universities.filter((u) => u.monitoring_status === 'active').length ?? 0;
  const activeExams = bundle?.examinations.filter((e) => e.monitoring_status === 'active').length ?? 0;
  const openCount = bundle?.universities.filter((u) => u.application_status === 'open').length ?? 0;
  const lastRun = bundle?.events.last_run ?? null;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-title">ADMITRA</div>
          <div className="brand-sub">Admissions Intelligence · IST</div>
        </div>
        <nav className="nav-list">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-btn ${tab === item.id ? 'active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              <span>{item.label}</span>
              {item.id === 'timeline' && timelineItems.length > 0 ? (
                <span className="mono">{timelineItems.length}</span>
              ) : null}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <div className="page-title">{NAV_ITEMS.find((n) => n.id === tab)?.label}</div>
            <div className="mono" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
              {bundle
                ? `DATA UPDATED ${formatIstDateTime(bundle.admissions.generated_at)} · TIMEZONE ASIA/KOLKATA`
                : 'LOADING ADMISSIONS DATABASE...'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a className="btn" href={calendarDownloadHref} download="admitra-calendar.ics">
              EXPORT .ICS
            </a>
            <button type="button" className="btn" disabled={loading} onClick={() => void reload()}>
              {loading ? 'REFRESHING...' : 'REFRESH'}
            </button>
          </div>
        </header>

        {error ? <div className="banner banner-error">Load Error: {error}</div> : null}

        {tab === 'overview' && bundle && (
          <>
            <section className="metrics-grid">
              <div className="metric-card">
                <div className="metric-label">Universities</div>
                <div className="metric-value">{activeUnis}/{bundle.universities.length}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Examinations</div>
                <div className="metric-value">{activeExams}/{bundle.examinations.length}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Open Applications</div>
                <div className="metric-value" style={{ color: 'var(--status-ok)' }}>{openCount}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Tracked Deadlines</div>
                <div className="metric-value" style={{ color: 'var(--accent-amber)' }}>
                  {upcomingDeadlines.length}
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Last Auto Check</div>
                <div className="metric-value" style={{ fontSize: 13, marginTop: 8 }}>
                  {lastRun ? formatIstDateTime(lastRun.finished_at) : 'PENDING RUN'}
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <span>Upcoming Deadlines &amp; Countdowns (Asia/Kolkata)</span>
                <span className="mono">VERIFIED · ANNOUNCED · UNVERIFIED</span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Countdown (IST)</th>
                    <th>Date</th>
                    <th>Entity</th>
                    <th>Milestone</th>
                    <th>Verification</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingDeadlines.map((dl) => (
                    <tr key={dl.id}>
                      <td>
                        <span className={countdownBadgeClass(dl.countdown.urgency)}>
                          {dl.countdown.label}
                        </span>
                      </td>
                      <td className="mono">{dl.countdown.istDateDisplay}</td>
                      <td>{dl.entity_name}</td>
                      <td>
                        <a href={dl.source_url} target="_blank" rel="noreferrer">{dl.title}</a>
                        <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {dl.original_timezone}
                          {dl.verification_history.previous_verified_date
                            ? ` · prev: ${dl.verification_history.previous_verified_date}`
                            : ''}
                        </div>
                      </td>
                      <td>
                        <span className={verificationBadgeClass(dl.verification_status)}>
                          {dl.verification_status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="panel">
              <div className="panel-header">
                <span>Monitored Sources &amp; Verification History</span>
                <span className="mono">DAILY GITHUB ACTIONS CHECK</span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>HTTP</th>
                    <th>Last Successful Check</th>
                    <th>Last Change</th>
                    <th>Failures</th>
                  </tr>
                </thead>
                <tbody>
                  {bundle.admissions.sources.map((src) => (
                    <tr key={src.source_id}>
                      <td>
                        <a href={src.url} target="_blank" rel="noreferrer">{src.title}</a>
                        <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          hash: {src.content_hash ? src.content_hash.slice(0, 12) : 'PENDING'}
                          {src.last_error ? ` · ${src.last_error}` : ''}
                        </div>
                      </td>
                      <td className="mono">{src.http_status || 'PENDING'}</td>
                      <td className="mono">{formatIstDateTime(src.verification_history.last_successful_check)}</td>
                      <td className="mono">{formatIstDateTime(src.verification_history.last_detected_change)}</td>
                      <td className="mono">{src.consecutive_failures}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}

        {tab === 'universities' && bundle && (
          <section className="panel">
            <div className="panel-header"><span>All 18 Tracked Universities</span></div>
            <table>
              <thead>
                <tr>
                  <th>University</th>
                  <th>Country</th>
                  <th>ECE-Equivalent Program</th>
                  <th>Application Status</th>
                  <th>Verification</th>
                  <th>Monitoring</th>
                </tr>
              </thead>
              <tbody>
                {bundle.universities.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <a href={u.admissions_url !== 'UNKNOWN' ? u.admissions_url : u.official_url} target="_blank" rel="noreferrer">
                        {u.official_name}
                      </a>
                    </td>
                    <td>{u.country}</td>
                    <td className="mono">{u.program_name}</td>
                    <td className="mono">{u.application_status.toUpperCase()}</td>
                    <td><span className={verificationBadgeClass(u.verification_status)}>{u.verification_status}</span></td>
                    <td><span className={u.monitoring_status === 'active' ? 'badge badge-ok' : 'badge badge-muted'}>{u.monitoring_status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {tab === 'examinations' && bundle && (
          <section className="panel">
            <div className="panel-header"><span>All 8 Entrance Examinations</span></div>
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Examination</th>
                  <th>Authority</th>
                  <th>Registration State</th>
                  <th>Verification</th>
                  <th>Monitoring</th>
                </tr>
              </thead>
              <tbody>
                {bundle.examinations.map((ex) => (
                  <tr key={ex.id}>
                    <td className="mono">{ex.short_code}</td>
                    <td>
                      <a href={ex.notices_url !== 'UNKNOWN' ? ex.notices_url : ex.official_url} target="_blank" rel="noreferrer">
                        {ex.official_name}
                      </a>
                    </td>
                    <td>{ex.authority}</td>
                    <td className="mono">{ex.registration_state.toUpperCase()}</td>
                    <td><span className={verificationBadgeClass(ex.verification_status)}>{ex.verification_status}</span></td>
                    <td><span className={ex.monitoring_status === 'active' ? 'badge badge-ok' : 'badge badge-muted'}>{ex.monitoring_status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {tab === 'timeline' && bundle && (
          <section className="panel">
            <div className="panel-header">
              <span>Chronological Admissions &amp; Exam Timeline</span>
              <span className="mono">SORTED BY DATE (IST)</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Date (IST)</th>
                  <th>Countdown</th>
                  <th>Kind</th>
                  <th>Entity</th>
                  <th>Event / Deadline</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {timelineItems.map((item) => {
                  const cd = calculateIstCountdown(item.date);
                  return (
                    <tr key={item.id}>
                      <td className="mono">{cd.istDateDisplay}</td>
                      <td><span className={countdownBadgeClass(cd.urgency)}>{cd.label}</span></td>
                      <td className="mono">{item.kind}</td>
                      <td>{item.entityName}</td>
                      <td>
                        <a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.title}</a>
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{item.subtitle}</div>
                      </td>
                      <td><span className={verificationBadgeClass(item.verification)}>{item.verification}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {tab === 'settings' && (
          <section className="panel" style={{ padding: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Google Calendar, Samsung Calendar &amp; Apple Calendar Sync (.ics)</div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
              Subscribe to the public <span className="mono">calendar.ics</span> URL below for automatic periodic updates
              (importing a downloaded file is a one-time snapshot).
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              <input className="input" type="text" readOnly value={calendarSubUrl} />
              <button type="button" className="btn" onClick={() => void copySubscriptionUrl()}>
                {copied ? 'COPIED' : 'COPY URL'}
              </button>
              <a className="btn" href={calendarDownloadHref} download="admitra-calendar.ics">
                DOWNLOAD .ICS
              </a>
            </div>
            <div className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              <div>1. Google Calendar: Other calendars (+) → From URL → paste subscription URL.</div>
              <div>2. Samsung Calendar: Sync your Google account in Samsung Calendar settings; the subscribed calendar appears automatically.</div>
              <div>3. Apple Calendar: File → New Calendar Subscription → paste subscription URL.</div>
              <div>4. Automation cadence: GitHub Actions runs once daily (08:00 IST) + manual workflow_dispatch.</div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
