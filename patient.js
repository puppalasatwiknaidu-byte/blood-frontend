initSession('bb_patient_token', showLogin);
fillGroupSelects();

// ---------- login / register ----------
function showLogin() {
  $('portal').classList.add('hidden');
  $('loginView').classList.remove('hidden');
}
async function showPortal() {
  $('loginView').classList.add('hidden');
  $('portal').classList.remove('hidden');
  switchTab('requests');
  await loadMe();
}
$('loginForm').addEventListener('submit', safe(async (e) => { e.preventDefault(); await authenticate(e.target, '/patient/login', showPortal); }));
$('registerForm').addEventListener('submit', safe(async (e) => { e.preventDefault(); await authenticate(e.target, '/patient/register', showPortal); }));
$('logoutBtn').addEventListener('click', () => { clearToken(); showLogin(); });
$('loginTabs').addEventListener('click', (e) => {
  const f = e.target.dataset.form;
  if (!f) return;
  document.querySelectorAll('#loginTabs button').forEach((b) => b.classList.toggle('active', b === e.target));
  ['loginForm', 'registerForm'].forEach((id) => $(id).classList.toggle('hidden', id !== f));
});

// ---------- tabs ----------
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('hidden', s.id !== tab));
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  if (tab === 'requests') safe(loadRequests)();
}
$('nav').addEventListener('click', (e) => { if (e.target.dataset.tab) switchTab(e.target.dataset.tab); });

// ---------- profile ----------
async function loadMe() {
  const me = await api('/me');
  $('hello').textContent = `Hello, ${me.name}`;
  $('info').textContent = `Blood group: ${me.blood_group}  |  Hospital: ${me.hospital}`;
  const f = $('profileForm');
  for (const k of ['name', 'age', 'gender', 'phone', 'blood_group', 'hospital']) f.elements[k].value = me[k] ?? '';
}
$('profileForm').addEventListener('submit', safe(async (e) => {
  e.preventDefault();
  await api('/me', 'PUT', formData(e.target));
  toast('Profile updated');
  loadMe();
}));
$('passwordForm').addEventListener('submit', safe(async (e) => {
  e.preventDefault();
  await api('/me/password', 'POST', formData(e.target));
  toast('Password updated');
  e.target.reset();
}));

// ---------- requests ----------
async function loadRequests() {
  const rows = await api('/me/requests');
  $('requestsBody').innerHTML = rows.length ? rows.map((r) =>
    `<tr><td>${r.id}</td><td>${esc(r.blood_group)}</td><td>${r.units_needed}</td><td>${esc(r.hospital)}</td><td>${badge(r.status)}</td>
     <td>${r.status === 'Pending'
       ? `<button class="small" data-edit="${r.id}" data-units="${r.units_needed}">Edit</button><button class="small grey" data-cancel="${r.id}">Cancel</button>` : ''}</td></tr>`).join('')
    : '<tr><td colspan="6" class="muted">No requests yet</td></tr>';
}
$('requestForm').addEventListener('submit', safe(async (e) => {
  e.preventDefault();
  await api('/me/requests', 'POST', formData(e.target));
  toast('Request submitted - the blood bank will review it');
  e.target.reset();
  loadRequests();
}));
$('requestsBody').addEventListener('click', safe(async (e) => {
  const { edit, cancel, units } = e.target.dataset;
  if (edit) {
    const v = prompt('New number of units:', units);
    if (v === null) return;
    await api(`/me/requests/${edit}`, 'PUT', { units_needed: v });
    toast('Request updated');
  } else if (cancel) {
    if (!confirm('Cancel this request?')) return;
    await api(`/me/requests/${cancel}`, 'DELETE');
    toast('Request cancelled');
  } else return;
  loadRequests();
}));

// ---------- start ----------
if (session.token) safe(showPortal)();
