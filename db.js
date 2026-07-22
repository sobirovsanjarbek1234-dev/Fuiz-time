// db.js
// Oddiy JSON-fayl asosidagi "ma'lumotlar bazasi". Kichik/o'rtacha loyihalar uchun
// tashqi bazaga (MySQL/Postgres) ehtiyoj qoldirmaslik uchun ishlatiladi.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'data', 'db.json');
const OWNER_EMAIL = 'sanjarbeksobirov244@gmail.com';

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(check, 'hex'), Buffer.from(hash, 'hex'));
}

function defaultDb() {
  // Egasi (owner) uchun boshlang'ich parol tasodifiy generatsiya qilinadi
  // va konsolga hamda admin-credentials.txt fayliga yoziladi.
  const initialPassword = crypto.randomBytes(6).toString('hex');
  const { salt, hash } = hashPassword(initialPassword);

  const credFile = path.join(__dirname, 'ADMIN-CREDENTIALS.txt');
  const content =
    `MC Bedrock Tracker - boshlang'ich admin ma'lumotlari\n` +
    `====================================================\n` +
    `Email: ${OWNER_EMAIL}\n` +
    `Parol: ${initialPassword}\n\n` +
    `MUHIM: Saytga birinchi marta kirgach, ushbu parolni albatta almashtiring\n` +
    `va bu faylni serverdan o'chirib tashlang.\n`;
  fs.writeFileSync(credFile, content, 'utf8');
  console.log('\n================================================');
  console.log(' Boshlang\'ich admin (ega) hisobi yaratildi:');
  console.log(' Email : ' + OWNER_EMAIL);
  console.log(' Parol : ' + initialPassword);
  console.log(' (Bu ma\'lumot ADMIN-CREDENTIALS.txt fayliga ham yozildi)');
  console.log('================================================\n');

  return {
    admins: [
      { email: OWNER_EMAIL, salt, hash, role: 'owner', createdAt: Date.now() }
    ],
    categories: [],
    servers: []
  };
}

let cache = null;

function load() {
  if (cache) return cache;
  if (!fs.existsSync(DB_PATH)) {
    cache = defaultDb();
    save();
  } else {
    try {
      cache = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch (e) {
      console.error('db.json o\'qishda xatolik, yangi baza yaratilmoqda:', e.message);
      cache = defaultDb();
      save();
    }
  }
  return cache;
}

function save() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(cache, null, 2), 'utf8');
}

module.exports = {
  OWNER_EMAIL,
  hashPassword,
  verifyPassword,
  load,
  save
};
