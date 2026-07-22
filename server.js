// server.js
// Tashqi kutubxonalarsiz (faqat Node.js "core" modullari) ishlaydigan
// Minecraft Bedrock server monitoring sayti.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const db = require('./db');
const { pingBedrockServer } = require('./bedrockPing');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');
const CHECK_INTERVAL_MS = 30 * 1000; // har 30 soniyada barcha serverlarni tekshirish

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ---------- Sessiyalar (xotirada, oddiy token asosida) ----------
const sessions = new Map(); // token -> { email, role, expires }
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 kun

function createSession(email, role) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { email, role, expires: Date.now() + SESSION_TTL_MS });
  return token;
}

function getSession(req) {
  const cookies = parseCookies(req);
  const token = cookies['mc_session'];
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (s.expires < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return s;
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
}

// ---------- Yordamchi funksiyalar ----------
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req, maxBytes = 15 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('payload_too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch (e) {
    return {};
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function serveStatic(req, res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 - Topilmadi');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function requireAuth(req, res) {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'Avtorizatsiyadan o\'tilmagan' });
    return null;
  }
  return session;
}

function requireOwner(req, res) {
  const session = requireAuth(req, res);
  if (!session) return null;
  if (session.role !== 'owner') {
    sendJson(res, 403, { error: 'Faqat ega (owner) uchun ruxsat berilgan' });
    return null;
  }
  return session;
}

function genId() {
  return crypto.randomBytes(8).toString('hex');
}

// base64 rasmni faylga saqlash, fayl nomini qaytaradi (/uploads/xxx.png)
function saveIconFromBase64(dataUrl) {
  const match = /^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const buf = Buffer.from(match[2], 'base64');
  if (buf.length > 3 * 1024 * 1024) throw new Error('Rasm hajmi 3MB dan katta bo\'lmasligi kerak');
  const filename = genId() + '.' + ext;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buf);
  return '/uploads/' + filename;
}

function publicServerView(s) {
  return {
    id: s.id,
    name: s.name,
    ip: s.ip,
    port: s.port,
    version: s.version,
    icon: s.icon || null,
    categoryId: s.categoryId || null,
    status: s.status || 'unknown',
    playersOnline: s.playersOnline || 0,
    playersMax: s.playersMax || 0,
    motd: s.motd || '',
    lastChecked: s.lastChecked || null
  };
}

// ---------- Fon rejimida barcha serverlarni tekshirish ----------
async function checkAllServers() {
  const data = db.load();
  if (!data.servers.length) return;
  await Promise.all(data.servers.map(async (s) => {
    try {
      const result = await pingBedrockServer(s.ip, s.port, 3000);
      s.status = result.online ? 'online' : 'offline';
      s.playersOnline = result.playersOnline || 0;
      s.playersMax = result.playersMax || 0;
      s.motd = result.motd || s.motd || '';
      s.latencyMs = result.latencyMs || null;
      s.lastChecked = Date.now();
    } catch (e) {
      s.status = 'offline';
      s.lastChecked = Date.now();
    }
  }));
  db.save();
}

setInterval(() => { checkAllServers().catch(() => {}); }, CHECK_INTERVAL_MS);
// server ishga tushganda darhol bir marta tekshiramiz
setTimeout(() => { checkAllServers().catch(() => {}); }, 1500);

// ---------- Router ----------
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsed.pathname);

  try {
    // ---- Statik fayllar ----
    if (req.method === 'GET' && pathname === '/') {
      return serveStatic(req, res, path.join(PUBLIC_DIR, 'index.html'));
    }
    if (req.method === 'GET' && pathname === '/login') {
      return serveStatic(req, res, path.join(PUBLIC_DIR, 'login.html'));
    }
    if (req.method === 'GET' && pathname === '/admin') {
      return serveStatic(req, res, path.join(PUBLIC_DIR, 'admin.html'));
    }
    if (req.method === 'GET' && (pathname.startsWith('/css/') || pathname.startsWith('/js/') || pathname.startsWith('/uploads/'))) {
      const safePath = path.normalize(path.join(PUBLIC_DIR, pathname));
      if (!safePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403); return res.end('Forbidden');
      }
      return serveStatic(req, res, safePath);
    }

    // ---- API: auth ----
    if (req.method === 'POST' && pathname === '/api/login') {
      const body = await readJsonBody(req);
      const email = (body.email || '').trim().toLowerCase();
      const password = body.password || '';
      const data = db.load();
      const admin = data.admins.find(a => a.email.toLowerCase() === email);
      if (!admin || !db.verifyPassword(password, admin.salt, admin.hash)) {
        return sendJson(res, 401, { error: 'Email yoki parol noto\'g\'ri' });
      }
      const token = createSession(admin.email, admin.role);
      res.setHeader('Set-Cookie', `mc_session=${token}; HttpOnly; Path=/; Max-Age=${SESSION_TTL_MS / 1000}; SameSite=Lax`);
      return sendJson(res, 200, { ok: true, email: admin.email, role: admin.role });
    }

    if (req.method === 'POST' && pathname === '/api/logout') {
      const cookies = parseCookies(req);
      if (cookies['mc_session']) sessions.delete(cookies['mc_session']);
      res.setHeader('Set-Cookie', 'mc_session=; HttpOnly; Path=/; Max-Age=0');
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && pathname === '/api/me') {
      const session = getSession(req);
      if (!session) return sendJson(res, 200, { loggedIn: false });
      return sendJson(res, 200, { loggedIn: true, email: session.email, role: session.role });
    }

    if (req.method === 'POST' && pathname === '/api/change-password') {
      const session = requireAuth(req, res);
      if (!session) return;
      const body = await readJsonBody(req);
      const { currentPassword, newPassword } = body;
      if (!newPassword || newPassword.length < 6) {
        return sendJson(res, 400, { error: 'Yangi parol kamida 6 belgidan iborat bo\'lishi kerak' });
      }
      const data = db.load();
      const admin = data.admins.find(a => a.email === session.email);
      if (!admin || !db.verifyPassword(currentPassword || '', admin.salt, admin.hash)) {
        return sendJson(res, 401, { error: 'Joriy parol noto\'g\'ri' });
      }
      const { salt, hash } = db.hashPassword(newPassword);
      admin.salt = salt; admin.hash = hash;
      db.save();
      return sendJson(res, 200, { ok: true });
    }

    // ---- API: admins (faqat owner) ----
    if (req.method === 'GET' && pathname === '/api/admins') {
      const session = requireOwner(req, res);
      if (!session) return;
      const data = db.load();
      return sendJson(res, 200, data.admins.map(a => ({ email: a.email, role: a.role, createdAt: a.createdAt })));
    }

    if (req.method === 'POST' && pathname === '/api/admins') {
      const session = requireOwner(req, res);
      if (!session) return;
      const body = await readJsonBody(req);
      const email = (body.email || '').trim().toLowerCase();
      const password = body.password || '';
      if (!email || !email.includes('@')) return sendJson(res, 400, { error: 'To\'g\'ri email kiriting' });
      if (!password || password.length < 6) return sendJson(res, 400, { error: 'Parol kamida 6 belgidan iborat bo\'lishi kerak' });
      const data = db.load();
      if (data.admins.some(a => a.email.toLowerCase() === email)) {
        return sendJson(res, 400, { error: 'Bu email allaqachon admin sifatida qo\'shilgan' });
      }
      const { salt, hash } = db.hashPassword(password);
      data.admins.push({ email, salt, hash, role: 'admin', createdAt: Date.now() });
      db.save();
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'DELETE' && pathname.startsWith('/api/admins/')) {
      const session = requireOwner(req, res);
      if (!session) return;
      const email = decodeURIComponent(pathname.split('/api/admins/')[1] || '').toLowerCase();
      if (email === db.OWNER_EMAIL.toLowerCase()) {
        return sendJson(res, 400, { error: 'Ega (owner) hisobini o\'chirib bo\'lmaydi' });
      }
      const data = db.load();
      const before = data.admins.length;
      data.admins = data.admins.filter(a => a.email.toLowerCase() !== email);
      if (data.admins.length === before) return sendJson(res, 404, { error: 'Admin topilmadi' });
      db.save();
      return sendJson(res, 200, { ok: true });
    }

    // ---- API: categories (bo'limlar) ----
    if (req.method === 'GET' && pathname === '/api/categories') {
      const data = db.load();
      return sendJson(res, 200, data.categories);
    }

    if (req.method === 'POST' && pathname === '/api/categories') {
      const session = requireAuth(req, res);
      if (!session) return;
      const body = await readJsonBody(req);
      const name = (body.name || '').trim();
      if (!name) return sendJson(res, 400, { error: 'Bo\'lim nomini kiriting' });
      const data = db.load();
      const cat = { id: genId(), name, createdAt: Date.now() };
      data.categories.push(cat);
      db.save();
      return sendJson(res, 200, cat);
    }

    if (req.method === 'DELETE' && pathname.startsWith('/api/categories/')) {
      const session = requireAuth(req, res);
      if (!session) return;
      const id = pathname.split('/api/categories/')[1];
      const data = db.load();
      data.categories = data.categories.filter(c => c.id !== id);
      data.servers.forEach(s => { if (s.categoryId === id) s.categoryId = null; });
      db.save();
      return sendJson(res, 200, { ok: true });
    }

    // ---- API: servers ----
    if (req.method === 'GET' && pathname === '/api/servers') {
      const data = db.load();
      return sendJson(res, 200, data.servers.map(publicServerView));
    }

    if (req.method === 'POST' && pathname === '/api/servers') {
      const session = requireAuth(req, res);
      if (!session) return;
      const body = await readJsonBody(req);
      const name = (body.name || '').trim();
      const ip = (body.ip || '').trim();
      const port = parseInt(body.port, 10) || 19132;
      const version = (body.version || '').trim();
      const categoryId = body.categoryId || null;

      if (!name || !ip) return sendJson(res, 400, { error: 'Server nomi va IP manzili majburiy' });

      let icon = null;
      if (body.iconBase64) {
        try {
          icon = saveIconFromBase64(body.iconBase64);
        } catch (e) {
          return sendJson(res, 400, { error: e.message });
        }
      }

      const data = db.load();
      const srv = {
        id: genId(),
        name, ip, port, version, categoryId, icon,
        status: 'unknown', playersOnline: 0, playersMax: 0, motd: '',
        lastChecked: null, createdBy: session.email, createdAt: Date.now()
      };
      data.servers.push(srv);
      db.save();

      // qo'shilgandan so'ng darhol tekshirib ko'ramiz (fonda, javobni kutmasdan)
      pingBedrockServer(ip, port, 3000).then((result) => {
        const d = db.load();
        const target = d.servers.find(x => x.id === srv.id);
        if (!target) return;
        target.status = result.online ? 'online' : 'offline';
        target.playersOnline = result.playersOnline || 0;
        target.playersMax = result.playersMax || 0;
        target.motd = result.motd || '';
        target.lastChecked = Date.now();
        db.save();
      }).catch(() => {});

      return sendJson(res, 200, publicServerView(srv));
    }

    if (req.method === 'PUT' && pathname.startsWith('/api/servers/')) {
      const session = requireAuth(req, res);
      if (!session) return;
      const id = pathname.split('/api/servers/')[1];
      const body = await readJsonBody(req);
      const data = db.load();
      const srv = data.servers.find(s => s.id === id);
      if (!srv) return sendJson(res, 404, { error: 'Server topilmadi' });

      if (typeof body.name === 'string' && body.name.trim()) srv.name = body.name.trim();
      if (typeof body.ip === 'string' && body.ip.trim()) srv.ip = body.ip.trim();
      if (body.port) srv.port = parseInt(body.port, 10) || srv.port;
      if (typeof body.version === 'string') srv.version = body.version.trim();
      if ('categoryId' in body) srv.categoryId = body.categoryId || null;
      if (body.iconBase64) {
        try {
          srv.icon = saveIconFromBase64(body.iconBase64);
        } catch (e) {
          return sendJson(res, 400, { error: e.message });
        }
      }
      db.save();
      return sendJson(res, 200, publicServerView(srv));
    }

    if (req.method === 'DELETE' && pathname.startsWith('/api/servers/')) {
      const session = requireAuth(req, res);
      if (!session) return;
      const id = pathname.split('/api/servers/')[1];
      const data = db.load();
      const before = data.servers.length;
      data.servers = data.servers.filter(s => s.id !== id);
      if (data.servers.length === before) return sendJson(res, 404, { error: 'Server topilmadi' });
      db.save();
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'POST' && pathname.match(/^\/api\/servers\/[a-f0-9]+\/check$/)) {
      const session = requireAuth(req, res);
      if (!session) return;
      const id = pathname.split('/')[3];
      const data = db.load();
      const srv = data.servers.find(s => s.id === id);
      if (!srv) return sendJson(res, 404, { error: 'Server topilmadi' });
      const result = await pingBedrockServer(srv.ip, srv.port, 3000);
      srv.status = result.online ? 'online' : 'offline';
      srv.playersOnline = result.playersOnline || 0;
      srv.playersMax = result.playersMax || 0;
      srv.motd = result.motd || srv.motd || '';
      srv.lastChecked = Date.now();
      db.save();
      return sendJson(res, 200, publicServerView(srv));
    }

    // ---- Topilmadi ----
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 - Sahifa topilmadi');
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: 'Server xatoligi: ' + err.message });
  }
});

db.load(); // birinchi ishga tushganda bazani tayyorlaydi (va owner parolini chiqaradi)

server.listen(PORT, () => {
  console.log(`MC Bedrock Tracker http://localhost:${PORT} manzilida ishga tushdi`);
});
