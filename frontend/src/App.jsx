import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE = { api: 'eventpulse_api_url', auth: 'eventpulse_auth_session' };
const statusOf = event => String(event?.status || 'unknown').toLowerCase();
const isOpen = event => ['open', 'published', 'active'].includes(statusOf(event));
const statusLabel = status => status === 'open' ? 'Open' : status === 'active' ? 'Active' : status === 'published' ? 'Published' : status.charAt(0).toUpperCase() + status.slice(1);

function normalizeApiBase(value) {
  const base = String(value || '').trim();
  if (!base) return '';
  try {
    const parsed = new URL(base);
    parsed.pathname = parsed.pathname.replace(/\/api\/?$/i, '').replace(/\/+$/, '');
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return base.replace(/\/api\/?$/i, '').replace(/\/+$/, '');
  }
}

function getInitialApiUrl() {
  const localDefault = ['localhost', '127.0.0.1'].includes(window.location.hostname) ? 'http://localhost:5000' : '';
  return normalizeApiBase(localStorage.getItem(STORAGE.api) || import.meta.env.VITE_API_BASE_URL || window.EVENTPULSE_CONFIG?.API_BASE_URL || localDefault);
}

async function request(apiBase, path, options = {}, accessToken = '') {
  if (!apiBase) throw new Error('Set your deployed backend URL in API settings, frontend/config.js, or Vercel’s VITE_API_BASE_URL variable.');
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = [data.error, data.details].filter((value, index, values) => value && values.indexOf(value) === index).join(': ');
    const error = new Error(message || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function BrandMark() {
  return <span className="brand-mark"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 17.5 9.2 12l3.5 3.1L20 7" stroke="white" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"/><path d="M15.7 7H20v4.3" stroke="white" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"/></svg></span>;
}

function EventCard({ event, index, joined, onDetails, onRegister, registering }) {
  const status = statusOf(event);
  const accepting = isOpen(event);
  const capacity = event.capacity == null ? 'Not specified' : `${Number(event.capacity).toLocaleString()} places`;
  const muted = ['closed', 'completed', 'cancelled'].includes(status);
  return (
    <article className="event-card">
      <div className="card-art">
        <span className={`badge ${accepting ? 'live' : muted ? 'closed' : ''}`}><span className="dot" />{statusLabel(status)}</span>
        <span className="art-index">EVENT · {String(index + 1).padStart(2, '0')}</span>
      </div>
      <div className="event-id">{event.id}</div>
      <h3 className="event-title">{event.title || 'Untitled event'}</h3>
      <div className="event-meta"><span>Capacity</span><strong className="capacity">♙ {capacity}</strong></div>
      <div className="card-actions">
        <button className="btn" onClick={() => onDetails(event)}>Details</button>
        {joined
          ? <button className="btn" disabled>✓ Registered</button>
          : <button className="btn primary" disabled={!accepting || registering} onClick={() => onRegister(event.id)}>{registering ? 'Registering…' : accepting ? 'Register' : 'Unavailable'}</button>}
      </div>
    </article>
  );
}

function SettingsModal({ apiUrl, onSave, onClose }) {
  const [draftApi, setDraftApi] = useState(apiUrl);
  const [error, setError] = useState('');
  return (
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <div className="modal-head"><div><h2 id="modalTitle">API connection</h2><p>Set the base URL for your Flask service.</p></div><button className="close" onClick={onClose} aria-label="Close">×</button></div>
        <form onSubmit={event => { event.preventDefault(); const normalized = normalizeApiBase(draftApi); if (!/^https?:\/\//i.test(normalized)) { setError('Enter a valid backend URL starting with http:// or https://.'); return; } onSave(normalized); }}>
          <div className="field"><label htmlFor="apiField">Backend API URL</label><input id="apiField" type="url" required value={draftApi} onChange={event => { setDraftApi(event.target.value); setError(''); }} placeholder="https://your-service.onrender.com" /><span className="help">Paste the backend URL. A trailing /api is also accepted. Local default: http://localhost:5000.</span></div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="modal-actions"><button className="btn" type="button" onClick={onClose}>Cancel</button><button className="btn primary" type="submit">Save &amp; connect</button></div>
        </form>
      </section>
    </div>
  );
}

function AccountModal({ apiUrl, onSuccess, onClose }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const result = await request(apiUrl, `/api/auth/${mode === 'login' ? 'login' : 'signup'}`, {
        method: 'POST', body: JSON.stringify({ email: email.trim(), password }),
      });
      if (result.access_token) onSuccess(result);
      else setMessage(result.message || 'Check your email to finish creating your account.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="accountTitle">
        <div className="modal-head"><div><h2 id="accountTitle">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2><p>Use your email to register and see your events.</p></div><button className="close" onClick={onClose} aria-label="Close">×</button></div>
        <form onSubmit={submit}>
          <div className="field"><label htmlFor="accountEmail">Email</label><input id="accountEmail" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></div>
          <div className="field"><label htmlFor="accountPassword">Password</label><input id="accountPassword" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'signup' ? 8 : undefined} required value={password} onChange={event => setPassword(event.target.value)} />{mode === 'signup' && <span className="help">At least 8 characters.</span>}</div>
          {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="help" role="status">{message}</p>}
          <div className="modal-actions"><button className="btn" type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setMessage(''); }}>{mode === 'login' ? 'Create account' : 'I already have an account'}</button><button className="btn primary" type="submit" disabled={saving}>{saving ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Sign up'}</button></div>
        </form>
      </section>
    </div>
  );
}

function EventDetailsModal({ event, userId, registered, onRegister, onClose, registering, onAttendees, attendees, loadingAttendees }) {
  const status = statusOf(event);
  const accepting = isOpen(event);
  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <div className="modal-head"><div><span className={`badge ${accepting ? 'live' : ''}`}><span className="dot" />{statusLabel(status)}</span><h2 id="modalTitle" className="detail-title">{event.title || 'Untitled event'}</h2><p>Event details from your organizer.</p></div><button className="close" onClick={onClose} aria-label="Close">×</button></div>
        <div className="field"><label>EVENT ID</label><div className="event-id detail-id">{event.id}</div></div>
        <div className="field"><label>CAPACITY</label><div>{event.capacity == null ? 'Not specified' : `${Number(event.capacity).toLocaleString()} places`}</div></div>
        {attendees && <div className="field"><label>ATTENDEES ({attendees.length})</label>{attendees.length ? attendees.map(row => <div className="event-id" key={row.id}>{row.users?.email || row.user_id}</div>) : <div className="help">No registrations yet.</div>}</div>}
        <div className="modal-actions"><button className="btn" onClick={onClose}>Close</button>{userId && event.organizer_id === userId && <button className="btn" disabled={loadingAttendees} onClick={() => onAttendees(event.id)}>{loadingAttendees ? 'Loading…' : 'View attendees'}</button>}{registered ? <button className="btn" disabled>✓ Registered</button> : accepting && <button className="btn primary" disabled={registering} onClick={() => onRegister(event.id)}>{registering ? 'Registering…' : 'Register'}</button>}</div>
      </section>
    </div>
  );
}

export default function App() {
  const [apiUrl, setApiUrl] = useState(getInitialApiUrl);
  const [authSession, setAuthSession] = useState(null);
  const authSessionRef = useRef(null);
  const [authRestoring, setAuthRestoring] = useState(true);
  const [events, setEvents] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [view, setView] = useState('overview');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [registeringId, setRegisteringId] = useState('');
  const [attendees, setAttendees] = useState(null);
  const [loadingAttendees, setLoadingAttendees] = useState(false);

  const notify = useCallback((message, isError = false) => setToast({ message, isError, key: Date.now() }), []);

  const authenticatedRequest = useCallback(async (path, options = {}) => {
    const session = authSessionRef.current;
    if (!session?.access_token) throw new Error('Sign in to continue.');
    try {
      return await request(apiUrl, path, options, session.access_token);
    } catch (error) {
      if (error.status !== 401 || !session.refresh_token) throw error;
      let refreshed;
      try {
        refreshed = await request(apiUrl, '/api/auth/refresh', {
          method: 'POST', body: JSON.stringify({ refresh_token: session.refresh_token }),
        });
      } catch {
        localStorage.removeItem(STORAGE.auth);
        authSessionRef.current = null;
        setAuthSession(null);
        setRegistrations([]);
        throw new Error('Your session expired. Please sign in again.');
      }
      authSessionRef.current = refreshed;
      localStorage.setItem(STORAGE.auth, JSON.stringify(refreshed));
      setAuthSession(refreshed);
      return request(apiUrl, path, options, refreshed.access_token);
    }
  }, [apiUrl]);

  useEffect(() => {
    let cancelled = false;
    async function restoreSession() {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE.auth) || 'null');
        if (!saved?.refresh_token) return;
        let session;
        try {
          const current = await request(apiUrl, '/api/auth/me', {}, saved.access_token);
          session = { ...saved, user: current.user };
        } catch {
          session = await request(apiUrl, '/api/auth/refresh', { method: 'POST', body: JSON.stringify({ refresh_token: saved.refresh_token }) });
        }
        if (cancelled) return;
        localStorage.setItem(STORAGE.auth, JSON.stringify(session));
        authSessionRef.current = session;
        setAuthSession(session);
      } catch {
        localStorage.removeItem(STORAGE.auth);
        authSessionRef.current = null;
      } finally {
        if (!cancelled) setAuthRestoring(false);
      }
    }
    restoreSession();
    return () => { cancelled = true; };
  }, [apiUrl]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await request(apiUrl, '/api/events');
      if (!Array.isArray(rows)) throw new Error('Expected a list from /api/events');
      setEvents(rows);
      setConnected(true);
      if (authSession?.access_token) {
        try {
          const mine = await authenticatedRequest('/api/me/registrations');
          setRegistrations(Array.isArray(mine) ? mine : []);
        } catch (requestError) {
          setRegistrations([]);
          notify(`Events loaded, but registrations could not be fetched: ${requestError.message}`, true);
        }
      } else {
        setRegistrations([]);
      }
    } catch (requestError) {
      setError(requestError.message);
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, authSession, authenticatedRequest, notify]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!toast) return undefined; const timer = window.setTimeout(() => setToast(null), 3500); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (!modal) return undefined;
    const closeOnEscape = event => { if (event.key === 'Escape') setModal(null); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [modal]);

  const acceptingCount = events.filter(isOpen).length;
  const mineIds = new Set(registrations.map(row => String(row.event_id)));
  let visibleEvents = view === 'mine'
    ? registrations.map(row => row.events || events.find(event => String(event.id) === String(row.event_id))).filter(Boolean)
    : events;
  if (view === 'live') {
    visibleEvents = visibleEvents.filter(isOpen);
  } else if (view !== 'mine') {
    if (filter === 'open') visibleEvents = visibleEvents.filter(isOpen);
    if (filter === 'closed') visibleEvents = visibleEvents.filter(event => !isOpen(event));
  }
  if (query.trim()) {
    const value = query.trim().toLowerCase();
    visibleEvents = visibleEvents.filter(event => [event.title, event.status, event.id].some(field => String(field || '').toLowerCase().includes(value)));
  }

  async function registerEvent(eventId) {
    if (!authSession?.access_token) { setModal({ type: 'account' }); notify('Sign in or create an account to register.'); return; }
    setRegisteringId(String(eventId));
    try {
      await authenticatedRequest('/api/registrations', { method: 'POST', body: JSON.stringify({ event_id: eventId }) });
      setModal(null);
      notify('You’re registered. See you there!');
      await load();
    } catch (requestError) {
      notify(requestError.message, true);
    } finally {
      setRegisteringId('');
    }
  }

  async function loadEventDetails(event) {
    setAttendees(null);
    setModal({ type: 'details', event, loading: true });
    try {
      const freshEvent = await request(apiUrl, `/api/events/${encodeURIComponent(event.id)}`);
      setModal(current => current?.type === 'details' ? { ...current, event: freshEvent, loading: false } : current);
    } catch (requestError) {
      setModal(current => current?.type === 'details' ? { ...current, loading: false } : current);
      notify(`Could not refresh event details: ${requestError.message}`, true);
    }
  }

  async function loadAttendees(eventId) {
    if (!authSession?.access_token) { notify('Sign in to view attendees.', true); return; }
    setLoadingAttendees(true);
    try {
      const rows = await authenticatedRequest(`/api/events/${encodeURIComponent(eventId)}/registrations`);
      setAttendees(Array.isArray(rows) ? rows : []);
    } catch (requestError) {
      notify(requestError.message, true);
    } finally {
      setLoadingAttendees(false);
    }
  }

  function saveSettings(newApiUrl) {
    localStorage.setItem(STORAGE.api, newApiUrl);
    setApiUrl(newApiUrl);
    setModal(null);
  }

  function saveAuth(session) {
    localStorage.setItem(STORAGE.auth, JSON.stringify(session));
    authSessionRef.current = session;
    setAuthSession(session);
    setModal(null);
    notify(`Signed in as ${session.user.email}`);
  }

  function signOut() {
    localStorage.removeItem(STORAGE.auth);
    authSessionRef.current = null;
    setAuthSession(null);
    setRegistrations([]);
    setModal(null);
    notify('You have been signed out.');
  }

  const currentLabel = view === 'mine' ? 'My registrations' : view === 'live' ? 'Open for registration' : view === 'discover' ? 'Discover events' : 'Overview';
  const heading = view === 'mine' ? 'Your registrations' : view === 'live' ? 'Open for registration' : view === 'discover' ? 'Discover events' : 'Explore events';
  const subheading = view === 'mine' ? 'Your event registrations, all in one place.' : view === 'live' ? 'Events currently accepting registrations.' : 'Browse the events currently listed by your organizer.';
  const profileLabel = authSession?.user?.email || (authRestoring ? 'Restoring account…' : 'Sign in to register');
  const navItems = [['overview', '⌂', 'Overview'], ['discover', '◈', 'Discover events'], ['live', '◉', 'Open for registration'], ['mine', '▣', 'My registrations']];

  return (
    <div className="shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`} id="sidebar">
        <a className="brand" href="#overview" aria-label="EventPulse home"><BrandMark /><span><span className="brand-name">EventPulse</span><br /><span className="brand-tag">EVENT DESK</span></span></a>
        <div className="nav-label">Workspace</div>
        <nav className="nav" aria-label="Main navigation">
          {navItems.map(([key, icon, label]) => <button key={key} className={view === key ? 'active' : ''} onClick={() => { setView(key); setMenuOpen(false); }}><span className="ico">{icon}</span>{label}</button>)}
        </nav>
        <div className="side-bottom"><button className="settings-link" onClick={() => setModal({ type: 'settings' })}><span className="ico">⚙</span>API settings</button><button className="settings-link" onClick={() => authSession ? signOut() : setModal({ type: 'account' })}><span className="ico">{authSession ? '↪' : '♙'}</span>{authSession ? 'Sign out' : 'Sign in'}</button><div className="identity-card"><div className="identity-title">Your account</div><div className="identity-sub">{profileLabel}</div></div><div className="sidebar-foot"><span className={`online-dot ${connected ? '' : 'offline'}`} /><span>{connected ? 'API connected' : 'API unavailable'}</span></div></div>
      </aside>

      <main className="main">
        <header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMenuOpen(open => !open)} aria-label="Open navigation">☰</button><div className="crumb">Workspace <span className="crumb-separator">/</span><b>{currentLabel}</b></div><div className="top-actions"><label className="search"><span>⌕</span><input type="search" placeholder="Search events…" aria-label="Search events" value={query} onChange={event => setQuery(event.target.value)} /><kbd>⌘ K</kbd></label><button className="icon-button" onClick={load} title="Refresh events" aria-label="Refresh events">↻</button><button className="avatar" onClick={() => authSession ? signOut() : setModal({ type: 'account' })} title={authSession ? 'Sign out' : 'Sign in'} aria-label={authSession ? 'Sign out' : 'Sign in'}>{authSession ? authSession.user.email.slice(0, 1).toUpperCase() : '?'}</button></div></header>
        <div className="content">
          <section className="welcome-row"><div className="welcome"><div className="eyebrow">Your event desk</div><h1>Find your next <span className="headline-accent">great event.</span></h1><p>Explore what’s happening and keep your registrations in one place.</p></div><button className="refresh" onClick={() => setModal({ type: 'settings' })}><span>⌘</span> API settings</button></section>
          <section className="stats" aria-label="Event summary">
            <article className="stat" style={{ '--glow': '#9a7bff' }}><div className="stat-head"><span>AVAILABLE EVENTS</span><span className="stat-icon">◈</span></div><div className="stat-value">{events.length}</div><div className="stat-note">Events listed by the organizer</div></article>
            <article className="stat" style={{ '--glow': '#55d7ae' }}><div className="stat-head"><span>OPEN FOR REGISTRATION</span><span className="stat-icon green-icon">◉</span></div><div className="stat-value">{acceptingCount}</div><div className="stat-note">Open, published, or active</div></article>
            <article className="stat" style={{ '--glow': '#6e9bff' }}><div className="stat-head"><span>YOUR REGISTRATIONS</span><span className="stat-icon blue-icon">▣</span></div><div className="stat-value">{authSession ? registrations.length : '—'}</div><div className="stat-note">{authSession ? 'Events linked to your email account' : 'Sign in to see your events'}</div></article>
          </section>
          <section>
            <div className="section-head"><div><h2>{heading}</h2><p>{subheading}</p></div>{view !== 'mine' && view !== 'live' && <div className="filters">{[['all', 'All events'], ['open', 'Open'], ['closed', 'Not open']].map(([key, label]) => <button key={key} className={`filter ${filter === key ? 'active' : ''}`} onClick={() => setFilter(key)}>{label}</button>)}</div>}</div>
            <div className="event-grid">
              {loading ? <div className="loading"><div className="loader" />Loading events…</div>
                : error ? <div className="error-box"><div className="empty-icon">⌁</div><h3>Couldn’t reach the events API</h3><p>{error}</p><button className="btn primary" onClick={load}>Try again</button><p className="help retry-help">Check that the Flask service is running and the API URL in settings is correct.</p></div>
                    : visibleEvents.length ? visibleEvents.map((event, index) => <EventCard key={event.id || index} event={event} index={index} joined={mineIds.has(String(event.id))} onDetails={loadEventDetails} onRegister={registerEvent} registering={registeringId === String(event.id)} />)
                    : <div className="empty"><div className="empty-icon">✧</div><h3>{view === 'mine' && !authSession ? 'Sign in to see your registrations' : 'No events here yet'}</h3><p>{view === 'mine' && !authSession ? 'Sign in with your email to load registrations linked to your account.' : 'When matching events are available, they’ll show up here.'}</p>{view === 'mine' && !authSession && <button className="btn primary" onClick={() => setModal({ type: 'account' })}>Sign in / create account</button>}</div>}
            </div>
          </section>
          <div className="notice"><b>Connection:</b> <span>{apiUrl || 'Backend URL not configured'}</span>. {authSession ? `Signed in as ${authSession.user.email}.` : 'Sign in with your email to register and see your saved events.'}</div>
        </div>
      </main>
      {modal?.type === 'settings' && <SettingsModal apiUrl={apiUrl} onSave={saveSettings} onClose={() => setModal(null)} />}
      {modal?.type === 'account' && <AccountModal apiUrl={apiUrl} onSuccess={saveAuth} onClose={() => setModal(null)} />}
      {modal?.type === 'details' && <EventDetailsModal event={modal.event} userId={authSession?.user?.id} registered={mineIds.has(String(modal.event.id))} onRegister={registerEvent} onAttendees={loadAttendees} attendees={attendees} loadingAttendees={loadingAttendees} onClose={() => setModal(null)} registering={registeringId === String(modal.event.id)} />}
      {toast && <div key={toast.key} className={`toast show ${toast.isError ? 'error' : ''}`} role="status" aria-live="polite">{toast.message}</div>}
    </div>
  );
}
