const GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
let token = localStorage.getItem('bb_token');
let role = localStorage.getItem('bb_role');
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const badge = (text) => {
  const cls = { Available: 'ok', Passed: 'ok', Issued: 'ok', Eligible: 'ok', Pending: 'warn', Failed: 'bad', Discarded: 'bad', Rejected: 'bad', 'Not eligible': 'bad' }[text] || '';
  return `<span class="badge ${cls}">${esc(text)}</span>`;
};

function toast(msg, type = 'success') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `show ${type}`;
  setTimeout(() => (t.className = ''), 2800);
}

async function api(path, method = 'GET', body) {
  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if ((res.status === 401 || res.status === 403) && !/login|register/.test(path)) { logout(); throw new Error('Session expired, please login again'); }
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// run an action and show errors as toast
const safe = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, 'error'); } };

// ---------- auth ----------
function showApp() {
  $('loginView').classList.add('hidden');
  if (role === 'patient') {
    $('patientView').classList.remove('hidden');
    safe(loadPortal)();
  } else {
    $('appView').classList.remove('hidden');
    switchTab('dashboard');
  }
}
function logout() {
  localStorage.removeItem('bb_token');
  localStorage.removeItem('bb_role');
  token = null;
  role = null;
  $('appView').classList.add('hidden');
  $('patientView').classList.add('hidden');
  $('loginView').classList.remove('hidden');
}
async function authenticate(form, path, newRole, label) {
  const btn = form.querySelector('button');
  btn.textContent = 'Please wait...';
  btn.disabled = true;
  try {
    const d = await api(path, 'POST', formData(form));
    token = d.token;
    role = newRole;
    localStorage.setItem('bb_token', token);
    localStorage.setItem('bb_role', role);
    form.reset();
    showApp();
  } finally {
    btn.textContent = label;
    btn.disabled = false;
  }
}
$('adminForm').addEventListener('submit', safe(async (e) => { e.preventDefault(); await authenticate(e.target, '/login', 'admin', 'Admin Login'); }));
$('patientLoginForm').addEventListener('submit', safe(async (e) => { e.preventDefault(); await authenticate(e.target, '/patient/login', 'patient', 'Login'); }));
$('registerForm').addEventListener('submit', safe(async (e) => { e.preventDefault(); await authenticate(e.target, '/patient/register', 'patient', 'Register'); }));
$('logoutBtn').addEventListener('click', logout);
$('patientLogout').addEventListener('click', logout);

$('loginTabs').addEventListener('click', (e) => {
  const f = e.target.dataset.form;
  if (!f) return;
  document.querySelectorAll('#loginTabs button').forEach((b) => b.classList.toggle('active', b === e.target));
  ['patientLoginForm', 'registerForm', 'adminForm'].forEach((id) => $(id).classList.toggle('hidden', id !== f));
});

// ---------- patient portal ----------
async function loadPortal() {
  const [me, rows] = await Promise.all([api('/me'), api('/me/requests')]);
  $('patientName').textContent = `Hello, ${me.name}`;
  $('patientInfo').textContent = `Blood group: ${me.blood_group}  |  Hospital: ${me.hospital}`;
  $('myRequestsBody').innerHTML = rows.length ? rows.map((r) =>
    `<tr><td>${r.id}</td><td>${esc(r.blood_group)}</td><td>${r.units_needed}</td><td>${esc(r.hospital)}</td><td>${badge(r.status)}</td></tr>`).join('')
    : '<tr><td colspan="5" class="muted">No requests yet</td></tr>';
}
$('myRequestForm').addEventListener('submit', safe(async (e) => {
  e.preventDefault();
  await api('/me/requests', 'POST', formData(e.target));
  toast('Request submitted - the blood bank will review it');
  e.target.reset();
  loadPortal();
}));

// ---------- tabs ----------
const loaders = { dashboard: loadDashboard, donors: loadDonors, patients: loadPatients, units: loadUnits, requests: loadRequests, transactions: loadTransactions };
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('hidden', s.id !== tab));
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  safe(loaders[tab])();
}
$('nav').addEventListener('click', (e) => { if (e.target.dataset.tab) switchTab(e.target.dataset.tab); });

function fillGroupSelects() {
  document.querySelectorAll('.groupSelect').forEach((s) => {
    s.innerHTML = '<option value="">Blood group *</option>' + GROUPS.map((g) => `<option>${g}</option>`).join('');
  });
}

const formData = (form) => Object.fromEntries(new FormData(form).entries());

// ---------- dashboard ----------
async function loadDashboard() {
  const d = await api('/inventory');
  $('stockCards').innerHTML = d.groups.map((g) =>
    `<div class="stat ${g.units === 0 ? 'zero' : g.units < 3 ? 'low' : ''}"><b>${g.units}</b>${esc(g.blood_group)}</div>`).join('');
  $('expiringBody').innerHTML = d.expiring.length
    ? d.expiring.map((u) => `<tr><td>${esc(u.unit_code)}</td><td>${esc(u.blood_group)}</td><td>${esc(u.expiry_date)}</td></tr>`).join('')
    : '<tr><td colspan="3" class="muted">No units expiring soon</td></tr>';
  $('expiredNote').textContent = d.expired ? `⚠ ${d.expired} expired unit(s) still in stock - click "Discard expired units".` : '';
}
$('discardBtn').addEventListener('click', safe(async () => {
  const d = await api('/units/discard-expired', 'POST');
  toast(`${d.discarded} expired unit(s) discarded`);
  loadDashboard();
}));

// ---------- donors ----------
async function loadDonors() {
  const rows = await api('/donors');
  $('donorsBody').innerHTML = rows.length ? rows.map((d) =>
    `<tr><td>${d.id}</td><td>${esc(d.name)}</td><td>${esc(d.blood_group)}</td><td>${d.age}</td><td>${esc(d.phone)}</td>
     <td>${badge(d.eligible ? 'Eligible' : 'Not eligible')}</td><td>${esc(d.screening_note)}</td></tr>`).join('')
    : '<tr><td colspan="7" class="muted">No donors yet</td></tr>';
}
$('donorForm').addEventListener('submit', safe(async (e) => {
  e.preventDefault();
  const d = await api('/donors', 'POST', formData(e.target));
  toast(d.eligible ? 'Donor registered - eligible' : 'Donor registered - NOT eligible: ' + d.screening_note, d.eligible ? 'success' : 'error');
  e.target.reset();
  loadDonors();
}));

// ---------- patients ----------
async function loadPatients() {
  const rows = await api('/patients');
  $('patientsBody').innerHTML = rows.length ? rows.map((p) =>
    `<tr><td>${p.id}</td><td>${esc(p.name)}</td><td>${p.age}</td><td>${esc(p.gender)}</td><td>${esc(p.blood_group)}</td>
     <td>${esc(p.hospital)}</td><td>${esc(p.phone)}</td></tr>`).join('')
    : '<tr><td colspan="7" class="muted">No patients yet</td></tr>';
}
$('patientForm').addEventListener('submit', safe(async (e) => {
  e.preventDefault();
  await api('/patients', 'POST', formData(e.target));
  toast('Patient registered');
  e.target.reset();
  loadPatients();
}));

// ---------- blood units ----------
async function loadUnits() {
  const [units, donors] = await Promise.all([api('/units'), api('/donors')]);
  const eligible = donors.filter((d) => d.eligible);
  $('donorSelect').innerHTML = '<option value="">Select eligible donor *</option>' +
    eligible.map((d) => `<option value="${d.id}">#${d.id} ${esc(d.name)} (${esc(d.blood_group)})</option>`).join('');
  $('unitsBody').innerHTML = units.length ? units.map((u) =>
    `<tr><td>${esc(u.unit_code)}</td><td>${esc(u.donor_name)}</td><td>${esc(u.blood_group)}</td><td>${badge(u.test_result)}</td>
     <td>${esc(u.collected_on)}</td><td>${esc(u.expiry_date)}</td><td>${badge(u.status)}</td></tr>`).join('')
    : '<tr><td colspan="7" class="muted">No blood units yet</td></tr>';
}
$('unitForm').addEventListener('submit', safe(async (e) => {
  e.preventDefault();
  const u = await api('/units', 'POST', formData(e.target));
  toast(`Unit ${u.unit_code} ${u.status === 'Available' ? 'added to inventory' : 'discarded (failed tests)'}`);
  loadUnits();
}));

// ---------- requests ----------
async function loadRequests() {
  const [rows, patients] = await Promise.all([api('/requests'), api('/patients')]);
  $('patientSelect').innerHTML = '<option value="">Select patient *</option>' +
    patients.map((p) => `<option value="${p.id}">#${p.id} ${esc(p.name)} (${esc(p.blood_group)}) - ${esc(p.hospital)}</option>`).join('');
  $('requestsBody').innerHTML = rows.length ? rows.map((r) =>
    `<tr><td>${r.id}</td><td>${esc(r.patient_name)}</td><td>${esc(r.hospital)}</td><td>${esc(r.blood_group)}</td><td>${r.units_needed}</td>
     <td>${badge(r.status)}</td>
     <td>${r.status === 'Pending'
       ? `<button class="small" data-issue="${r.id}">Issue</button><button class="small grey" data-reject="${r.id}">Reject</button>` : ''}</td></tr>`).join('')
    : '<tr><td colspan="7" class="muted">No requests yet</td></tr>';
}
$('requestForm').addEventListener('submit', safe(async (e) => {
  e.preventDefault();
  await api('/requests', 'POST', formData(e.target));
  toast('Request submitted');
  e.target.reset();
  loadRequests();
}));
$('requestsBody').addEventListener('click', safe(async (e) => {
  const { issue, reject } = e.target.dataset;
  if (issue) { const d = await api(`/requests/${issue}/issue`, 'POST'); toast('Issued: ' + d.issued.join(', ')); }
  else if (reject) { await api(`/requests/${reject}/reject`, 'POST'); toast('Request rejected'); }
  else return;
  loadRequests();
}));

// ---------- transactions ----------
async function loadTransactions() {
  const rows = await api('/transactions');
  $('transactionsBody').innerHTML = rows.length ? rows.map((t) =>
    `<tr><td>${new Date(t.created_at + 'Z').toLocaleString()}</td><td>${esc(t.type)}</td><td>${esc(t.unit_code)}</td><td>${esc(t.request_id)}</td><td>${esc(t.note)}</td></tr>`).join('')
    : '<tr><td colspan="5" class="muted">No transactions yet</td></tr>';
}

// ---------- start ----------
fillGroupSelects();
if (token && role) showApp(); else if (token) logout();
