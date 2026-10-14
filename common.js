// Shared helpers used by both the patient page and the admin page
const GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const badge = (text) => {
  const cls = { Available: 'ok', Passed: 'ok', Issued: 'ok', Eligible: 'ok', Pending: 'warn', Failed: 'bad', Discarded: 'bad', Rejected: 'bad', Cancelled: 'bad', 'Not eligible': 'bad' }[text] || '';
  return `<span class="badge ${cls}">${esc(text)}</span>`;
};
const formData = (form) => Object.fromEntries(new FormData(form).entries());

function toast(msg, type = 'success') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `show ${type}`;
  setTimeout(() => (t.className = ''), 3000);
}

// Each page has its own token key, so admin and patient logins never clash
const session = { key: '', token: null, onExpire: () => {} };
function initSession(key, onExpire) {
  session.key = key;
  session.token = localStorage.getItem(key);
  session.onExpire = onExpire;
}
function setToken(t) { session.token = t; localStorage.setItem(session.key, t); }
function clearToken() { session.token = null; localStorage.removeItem(session.key); }

async function api(path, method = 'GET', body) {
  let res;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Cannot reach the server. If it was idle, wait 30-60 seconds and try again.');
  }
  const data = await res.json().catch(() => ({}));
  const isAuthCall = /login|register/.test(path);
  if ((res.status === 401 || res.status === 403) && !isAuthCall) {
    clearToken();
    session.onExpire();
    throw new Error('Session expired, please login again');
  }
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// run an action and show any error as a toast
const safe = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, 'error'); } };

function fillGroupSelects() {
  document.querySelectorAll('.groupSelect').forEach((s) => {
    s.innerHTML = '<option value="">Blood group *</option>' + GROUPS.map((g) => `<option>${g}</option>`).join('');
  });
}

// log in / register helper: posts the form, stores the token, runs onDone
async function authenticate(form, path, onDone) {
  const btn = form.querySelector('button[type=submit]');
  const label = btn.textContent;
  btn.textContent = 'Please wait...';
  btn.disabled = true;
  try {
    const d = await api(path, 'POST', formData(form));
    setToken(d.token);
    form.reset();
    await onDone();
  } finally {
    btn.textContent = label;
    btn.disabled = false;
  }
}
