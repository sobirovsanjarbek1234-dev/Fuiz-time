# MC Bedrock Tracker

Minecraft Bedrock serverlarining onlayn/oflayn holatini avtomatik kuzatib turuvchi sayt.
Hech qanday tashqi npm paketiga (Express, SQLite va h.k.) ehtiyoj yo'q — faqat Node.js
ning o'zida keladigan modullar bilan ishlaydi, shuning uchun `npm install` shart emas.

## Imkoniyatlar

- Bosh sahifada barcha serverlar **bo'limlar (kategoriyalar)** bo'yicha guruhlangan holda
  ko'rsatiladi, har biri onlayn/oflayn holati, o'yinchular soni va versiyasi bilan.
- Holat **har 30 soniyada avtomatik** tekshiriladi (haqiqiy RakNet/Bedrock ping protokoli orqali).
- **Ega (owner)** hisobi: `sanjarbeksobirov244@gmail.com` — u boshqa adminlarni qo'sha oladi/o'chira oladi.
- **Admin** hisoblari: server qo'shish, tahrirlash, o'chirish; bo'lim yaratish/o'chirish.
- Server qo'shishda: nomi, IP:port, versiyasi, ikonka rasmi (ixtiyoriy) va bo'lim tanlanadi.

## O'rnatish va ishga tushirish

1. Ushbu papkani serveringizga yuklang.
2. Node.js (16-versiyadan yuqori) o'rnatilganiga ishonch hosil qiling.
3. Papka ichida terminalda:

   ```bash
   node server.js
   ```

   Standart holatda sayt `3000`-portda ishga tushadi. Portni o'zgartirish uchun:

   ```bash
   PORT=8080 node server.js
   ```

4. Fon rejimida doimiy ishlashi uchun `pm2` yoki `systemd` dan foydalanishni tavsiya qilamiz:

   ```bash
   npm install -g pm2
   pm2 start server.js --name mc-tracker
   pm2 save
   ```

## Birinchi marta kirish

Server birinchi marta ishga tushganda `sanjarbeksobirov244@gmail.com` uchun **tasodifiy parol**
avtomatik yaratiladi va:

- terminalga chiqariladi,
- loyihaning ichida `ADMIN-CREDENTIALS.txt` fayliga yoziladi.

`https://saytingiz.com/admin` manziliga kirib, o'sha email va parol bilan tizimga kiring,
so'ngra **"Hisobim"** bo'limidan parolni albatta o'zingizga qulay parolga almashtiring va
xavfsizlik uchun `ADMIN-CREDENTIALS.txt` faylini serverdan o'chirib tashlang.

## Loyiha tuzilishi

```
mc-tracker/
  server.js          - asosiy server (routing, API, fon holat tekshiruvi)
  db.js              - JSON-fayl asosidagi oddiy "baza" va parol xeshlash
  bedrockPing.js      - Bedrock (RakNet) serverini "ping" qilish logikasi
  package.json
  data/db.json        - barcha ma'lumotlar shu yerda saqlanadi (avtomatik yaratiladi)
  public/
    index.html         - ommaviy sahifa (barcha foydalanuvchilar ko'radi)
    login.html          - admin kirish sahifasi
    admin.html          - admin panel
    css/style.css
    js/app.js           - ommaviy sahifa logikasi
    js/admin.js         - admin panel logikasi
    uploads/            - yuklangan server ikonkalari shu yerda saqlanadi
```

## Muhim eslatmalar

- `data/db.json` fayli barcha serverlar, bo'limlar va adminlar haqidagi ma'lumotni saqlaydi.
  Uni zaxira nusxalab turing (backup).
- Ba'zi hosting/VPS provayderlar UDP trafikni cheklashi mumkin — Bedrock ping ishlashi uchun
  serveringizdan chiquvchi UDP so'rovlariga ruxsat berilgan bo'lishi kerak.
- Agar `PORT` band bo'lsa, muhit o'zgaruvchisi orqali boshqa portni belgilang.
