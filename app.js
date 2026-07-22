// app.js - ommaviy sahifa mantiqi

const REFRESH_MS = 15000; // sahifa har 15 soniyada ma'lumotni qayta yuklaydi

function timeAgo(ts) {
  if (!ts) return 'hali tekshirilmagan';
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 10) return 'hozirgina';
  if (diff < 60) return diff + ' soniya oldin';
  if (diff < 3600) return Math.floor(diff / 60) + ' daqiqa oldin';
  return Math.floor(diff / 3600) + ' soat oldin';
}

function iconMarkup(server) {
  if (server.icon) {
    return `<div class="card-icon" style="background-image:url('${server.icon}')"></div>`;
  }
  return `<div class="card-icon">⛏️</div>`;
}

function serverCard(server) {
  const statusClass = server.status === 'online' ? 'online' : (server.status === 'offline' ? 'offline' : 'unknown');
  const statusLabel = server.status === 'online' ? 'Onlayn' : (server.status === 'offline' ? 'Oflayn' : 'Noma\'lum');
  const pct = server.playersMax ? Math.min(100, Math.round((server.playersOnline / server.playersMax) * 100)) : 0;

  return `
  <div class="card status-${statusClass}">
    <div class="card-top">
      ${iconMarkup(server)}
      <div style="flex:1; min-width:0;">
        <p class="card-title">${escapeHtml(server.name)}</p>
        <p class="card-sub">${escapeHtml(server.ip)}:${server.port}${server.version ? ' • v' + escapeHtml(server.version) : ''}</p>
        <div class="status-pill ${statusClass}"><span class="dot"></span>${statusLabel}</div>
      </div>
    </div>
    ${server.motd ? `<div class="motd">${escapeHtml(server.motd)}</div>` : ''}
    <div class="card-meta">
      <span>👥 ${server.playersOnline}/${server.playersMax || '?'} o'yinchi</span>
      <span>${timeAgo(server.lastChecked)}</span>
    </div>
    ${server.playersMax ? `<div class="players-bar"><div class="players-bar-fill" style="width:${pct}%"></div></div>` : ''}
  </div>`;
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

async function loadData() {
  try {
    const [servers, categories] = await Promise.all([
      fetch('/api/servers').then(r => r.json()),
      fetch('/api/categories').then(r => r.json())
    ]);
    render(servers, categories);
  } catch (e) {
    document.getElementById('content').innerHTML = `<div class="empty">Ma'lumotlarni yuklashda xatolik yuz berdi.</div>`;
  }
}

function render(servers, categories) {
  const online = servers.filter(s => s.status === 'online').length;
  const offline = servers.filter(s => s.status === 'offline').length;
  document.getElementById('statOnline').textContent = online;
  document.getElementById('statOffline').textContent = offline;
  document.getElementById('statTotal').textContent = servers.length;

  const content = document.getElementById('content');

  if (!servers.length) {
    content.innerHTML = `<div class="empty">
      <span class="pixel">HALI SERVER YO'Q</span>
      Admin panel orqali birinchi Bedrock serveringizni qo'shing.
    </div>`;
    return;
  }

  const grouped = new Map();
  categories.forEach(c => grouped.set(c.id, []));
  grouped.set('__none__', []);

  servers.forEach(s => {
    const key = s.categoryId && grouped.has(s.categoryId) ? s.categoryId : '__none__';
    grouped.get(key).push(s);
  });

  let html = '';
  categories.forEach(cat => {
    const list = grouped.get(cat.id);
    if (!list.length) return;
    html += sectionHtml(cat.name, list);
  });
  const noCategory = grouped.get('__none__');
  if (noCategory.length) {
    html += sectionHtml(categories.length ? 'Boshqa serverlar' : 'Barcha serverlar', noCategory);
  }

  content.innerHTML = html;
}

function sectionHtml(title, list) {
  return `
  <section class="section-block">
    <div class="section-head">
      <div class="chip"></div>
      <h2>${escapeHtml(title)}</h2>
      <span class="count">${list.length} ta server</span>
    </div>
    <div class="grid">
      ${list.map(serverCard).join('')}
    </div>
  </section>`;
}

loadData();
setInterval(loadData, REFRESH_MS);
