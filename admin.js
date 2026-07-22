// admin.js - admin panel mantiqi

let currentUser = null;
let categoriesCache = [];
let iconBase64 = null;

function showToast(message, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Xatolik yuz berdi');
  return data;
}

// ---------- Auth / boshlang'ich yuklash ----------
async function init() {
  try {
    const me = await api('/api/me');
    if (!me.loggedIn) {
      window.location.href = '/login';
      return;
    }
    currentUser = me;
    document.getElementById('whoami').textContent = me.email + (me.role === 'owner' ? ' (ega)' : '');
    if (me.role === 'owner') {
      document.getElementById('adminsTabLink').style.display = 'block';
    }
  } catch (e) {
    window.location.href = '/login';
    return;
  }

  setupTabs();
  setupLogout();
  setupServerModal();
  setupCategoryForm();
  setupAdminForm();
  setupAccountForm();

  await Promise.all([loadServers(), loadCategories()]);
  if (currentUser.role === 'owner') loadAdmins();
}

function setupTabs() {
  document.querySelectorAll('.admin-sidebar a').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.admin-sidebar a').forEach(x => x.classList.remove('active'));
      a.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
      document.getElementById('tab-' + a.dataset.tab).style.display = 'block';
    });
  });
}

function setupLogout() {
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' });
    window.location.href = '/login';
  });
}

// ---------- Serverlar ----------
async function loadServers() {
  const servers = await api('/api/servers');
  const tbody = document.getElementById('serversTbody');
  const empty = document.getElementById('serversEmpty');
  if (!servers.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = servers.map(s => {
    const cat = categoriesCache.find(c => c.id === s.categoryId);
    const statusClass = s.status === 'online' ? 'online' : (s.status === 'offline' ? 'offline' : 'unknown');
    const statusLabel = s.status === 'online' ? 'Onlayn' : (s.status === 'offline' ? 'Oflayn' : 'Noma\'lum');
    return `
    <tr>
      <td>${s.icon ? `<img src="${s.icon}" style="width:32px;height:32px;border-radius:4px;object-fit:cover;">` : '⛏️'}</td>
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.ip)}:${s.port}</td>
      <td>${escapeHtml(s.version || '—')}</td>
      <td>${cat ? escapeHtml(cat.name) : '—'}</td>
      <td><span class="status-pill ${statusClass}"><span class="dot"></span>${statusLabel}</span></td>
      <td class="row-actions">
        <button class="btn btn-sm" data-edit="${s.id}">Tahrirlash</button>
        <button class="btn btn-sm btn-danger" data-delete="${s.id}">O'chirish</button>
      </td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openServerModal(servers.find(s => s.id === btn.dataset.edit)));
  });
  tbody.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Ushbu serverni o\'chirmoqchimisiz?')) return;
      try {
        await api('/api/servers/' + btn.dataset.delete, { method: 'DELETE' });
        showToast('Server o\'chirildi');
        loadServers();
      } catch (e) { showToast(e.message, 'error'); }
    });
  });
}

function setupServerModal() {
  const modal = document.getElementById('serverModal');
  document.getElementById('openAddServer').addEventListener('click', () => openServerModal(null));
  document.getElementById('cancelServerModal').addEventListener('click', () => modal.style.display = 'none');

  document.getElementById('serverIconInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      iconBase64 = reader.result;
      document.getElementById('iconPreview').style.backgroundImage = `url('${iconBase64}')`;
      document.getElementById('iconPreview').style.backgroundSize = 'cover';
      document.getElementById('iconPreview').textContent = '';
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('saveServerBtn').addEventListener('click', async () => {
    const id = document.getElementById('serverId').value;
    const payload = {
      name: document.getElementById('serverName').value.trim(),
      ip: document.getElementById('serverIp').value.trim(),
      port: parseInt(document.getElementById('serverPort').value, 10) || 19132,
      version: document.getElementById('serverVersion').value.trim(),
      categoryId: document.getElementById('serverCategory').value || null
    };
    if (iconBase64) payload.iconBase64 = iconBase64;

    if (!payload.name || !payload.ip) {
      showToast('Server nomi va IP manzilini kiriting', 'error');
      return;
    }

    try {
      if (id) {
        await api('/api/servers/' + id, { method: 'PUT', body: JSON.stringify(payload) });
        showToast('Server yangilandi');
      } else {
        await api('/api/servers', { method: 'POST', body: JSON.stringify(payload) });
        showToast('Server qo\'shildi');
      }
      modal.style.display = 'none';
      loadServers();
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
}

function openServerModal(server) {
  const modal = document.getElementById('serverModal');
  iconBase64 = null;
  document.getElementById('serverModalTitle').textContent = server ? 'Serverni tahrirlash' : 'Server qo\'shish';
  document.getElementById('serverId').value = server ? server.id : '';
  document.getElementById('serverName').value = server ? server.name : '';
  document.getElementById('serverIp').value = server ? server.ip : '';
  document.getElementById('serverPort').value = server ? server.port : 19132;
  document.getElementById('serverVersion').value = server ? server.version : '';

  const select = document.getElementById('serverCategory');
  select.innerHTML = '<option value="">— Tanlanmagan —</option>' +
    categoriesCache.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  if (server && server.categoryId) select.value = server.categoryId;

  const preview = document.getElementById('iconPreview');
  if (server && server.icon) {
    preview.style.backgroundImage = `url('${server.icon}')`;
    preview.style.backgroundSize = 'cover';
    preview.textContent = '';
  } else {
    preview.style.backgroundImage = '';
    preview.textContent = 'Rasm yo\'q';
  }

  modal.style.display = 'flex';
}

// ---------- Bo'limlar ----------
async function loadCategories() {
  const categories = await api('/api/categories');
  categoriesCache = categories;
  const servers = await api('/api/servers');

  const tbody = document.getElementById('categoriesTbody');
  const empty = document.getElementById('categoriesEmpty');
  if (!categories.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = categories.map(c => {
    const count = servers.filter(s => s.categoryId === c.id).length;
    return `<tr>
      <td>${escapeHtml(c.name)}</td>
      <td>${count}</td>
      <td class="row-actions"><button class="btn btn-sm btn-danger" data-del-cat="${c.id}">O'chirish</button></td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('[data-del-cat]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Bo\'limni o\'chirsangiz, undagi serverlar "bo\'limsiz" bo\'lib qoladi. Davom etasizmi?')) return;
      try {
        await api('/api/categories/' + btn.dataset.delCat, { method: 'DELETE' });
        showToast('Bo\'lim o\'chirildi');
        await loadCategories();
        loadServers();
      } catch (e) { showToast(e.message, 'error'); }
    });
  });
}

function setupCategoryForm() {
  document.getElementById('addCategoryBtn').addEventListener('click', async () => {
    const input = document.getElementById('newCategoryName');
    const name = input.value.trim();
    if (!name) { showToast('Bo\'lim nomini kiriting', 'error'); return; }
    try {
      await api('/api/categories', { method: 'POST', body: JSON.stringify({ name }) });
      input.value = '';
      showToast('Bo\'lim qo\'shildi');
      loadCategories();
    } catch (e) { showToast(e.message, 'error'); }
  });
}

// ---------- Adminlar (faqat owner) ----------
async function loadAdmins() {
  const admins = await api('/api/admins');
  const tbody = document.getElementById('adminsTbody');
  tbody.innerHTML = admins.map(a => `
    <tr>
      <td>${escapeHtml(a.email)}</td>
      <td>${a.role === 'owner' ? 'Ega' : 'Admin'}</td>
      <td class="row-actions">
        ${a.role !== 'owner' ? `<button class="btn btn-sm btn-danger" data-del-admin="${a.email}">O'chirish</button>` : ''}
      </td>
    </tr>`).join('');

  tbody.querySelectorAll('[data-del-admin]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Ushbu adminni o\'chirmoqchimisiz?')) return;
      try {
        await api('/api/admins/' + encodeURIComponent(btn.dataset.delAdmin), { method: 'DELETE' });
        showToast('Admin o\'chirildi');
        loadAdmins();
      } catch (e) { showToast(e.message, 'error'); }
    });
  });
}

function setupAdminForm() {
  document.getElementById('addAdminBtn').addEventListener('click', async () => {
    const email = document.getElementById('newAdminEmail').value.trim();
    const password = document.getElementById('newAdminPassword').value;
    if (!email || !password) { showToast('Email va parolni kiriting', 'error'); return; }
    try {
      await api('/api/admins', { method: 'POST', body: JSON.stringify({ email, password }) });
      document.getElementById('newAdminEmail').value = '';
      document.getElementById('newAdminPassword').value = '';
      showToast('Admin qo\'shildi');
      loadAdmins();
    } catch (e) { showToast(e.message, 'error'); }
  });
}

// ---------- Hisob ----------
function setupAccountForm() {
  document.getElementById('changePasswordBtn').addEventListener('click', async () => {
    const currentPassword = document.getElementById('curPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    try {
      await api('/api/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
      showToast('Parol yangilandi');
      document.getElementById('curPassword').value = '';
      document.getElementById('newPassword').value = '';
    } catch (e) { showToast(e.message, 'error'); }
  });
}

init();
