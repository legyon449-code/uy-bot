# Uy-bot (Telegram guruh + arenda/sotuv uylar mini-app)

## Bot nima qiladi

1. **Guruhda "taklif qil" tizimi**: guruhga qo'shilgan har bir odam (admin bundan mustasno)
   avval **5 kishini** taklif qilmaguncha, yozgan xabari o'chirib tashlanadi va shaxsiy
   taklif havolasi beriladi. 5 kishini taklif qilgach — erkin yoza oladi.
   Keyin yana 1 marta yozsa, tizim yana 5 kishi (jami 10) taklif qilishni so'raydi —
   va shu tartibda davom etadi (`.env` dagi `INVITE_STEP` orqali sozlanadi).
2. **Mini-app**: bot ichidagi tugma orqali ochiladigan sahifada barcha uylar —
   rasmi, narxi (so'mda) va holati (Ijarada / Sotuvda / Sotilgan) ko'rsatiladi.
3. **Faqat admin** (siz) botga shaxsiy yozib, yangi e'lon qo'shishi, rasm/narx/holatni
   o'zgartirishi yoki e'lonni o'chirishi mumkin. Boshqa hech kim buni qila olmaydi.

---

## 1-qadam: Botni sozlash (BotFather)

Siz aytganingizdek, tokenni allaqachon olgansiz. Yana ikkita narsa zarur:

1. **Mini-app tugmasi ko'rinishi uchun** — BotFather'da qo'shimcha sozlash shart emas,
   chunki webapp tugmasini bot o'zi (`bot.js` ichida) yuboradi.
2. Guruhda xabar o'chirish uchun **botni guruhga admin qilib qo'ying** va unga
   quyidagi huquqlarni bering:
   - "Delete messages" (xabarlarni o'chirish)
   - "Invite users via link" (taklif havolasi yaratish)

---

## 2-qadam: `.env` faylini to'ldirish

`.env.example` faylidan nusxa oling:

```bash
cp .env.example .env
```

Va quyidagilarni kiriting:
- `BOT_TOKEN` — BotFather'dan olgan tokeningiz
- `ADMIN_ID` — sizning Telegram user ID raqamingiz (buni @userinfobot orqali bilib olasiz)
- `BASE_URL` — Render sizga beradigan manzil (masalan `https://uy-bot.onrender.com`) —
  buni Render'ga joylagandan keyin to'ldirasiz (pastda tushuntirilgan)

---

## 3-qadam: GitHub'ga yuklash

Loyihani o'z kompyuteringizda (yoki shu papkada) quyidagicha GitHub'ga yuklaysiz:

```bash
cd uy-bot
git init
git add .
git commit -m "Uy-bot: birinchi versiya"
git branch -M main
git remote add origin https://github.com/<sizning-username>/uy-bot.git
git push -u origin main
```

> **Muhim:** `.env` faylini hech qachon GitHub'ga yuklamang — u tokeningizni oshkor
> qiladi. Loyihada `.gitignore` fayli bor, u `.env`ni avtomatik chiqarib tashlaydi.

---

## 4-qadam: Render'ga ulash

1. https://render.com saytiga kiring, GitHub akkountingiz bilan ro'yxatdan o'ting.
2. **New +** → **Web Service** tugmasini bosing.
3. GitHub'dagi `uy-bot` repositoriyangizni tanlang.
4. Sozlamalar:
   - **Name**: `uy-bot` (yoki xohlagan nom)
   - **Region**: eng yaqinini tanlang
   - **Branch**: `main`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free (boshlash uchun yetarli)
5. **Environment Variables** bo'limida `.env` dagi barcha qiymatlarni qo'lda kiriting:
   - `BOT_TOKEN`
   - `ADMIN_ID`
   - `INVITE_STEP` (masalan `5`)
   - `BASE_URL` — birinchi marta bo'sh qoldirib deploy qilishingiz mumkin,
     Render manzilni bergandan keyin (masalan `https://uy-bot.onrender.com`)
     shu qiymatni `BASE_URL`ga yozib, **qayta deploy** qiling (Manual Deploy → Deploy latest commit).
   - `PORT` ni kiritmang — Render buni o'zi beradi.
6. **Create Web Service** tugmasini bosing. Bir necha daqiqada bot ishga tushadi.

Deploy tugagach, Render sizga bergan asosiy URL manzilni ko'chirib, uni `.env`dagi/
Render sozlamalaridagi `BASE_URL`ga qo'yishni unutmang — mini-app tugmasi shu manzil
orqali ochiladi.

> **Eslatma (Free tarif haqida):** Render'ning bepul tarifida servis 15 daqiqa
> harakatsiz qolsa "uxlab qoladi" va keyingi so'rovda ~30 soniya sekinroq uyg'onadi.
> Bot doim tayyor tursin desangiz, pullik ("Starter") tarifga o'tish tavsiya etiladi.

---

## Lokal (o'z kompyuteringizda) sinab ko'rish

```bash
npm install
npm start
```

Mini-app'ni Telegram tashqarisida ham `http://localhost:3000/webapp` orqali ko'rish
mumkin (lekin taklif havolasi va bot funksiyalari faqat Telegram ichida ishlaydi,
chunki `BASE_URL` internetdan ochiq manzil bo'lishi shart — shuning uchun mini-app
tugmasini sinash uchun Render'dagi (yoki ngrok kabi) ochiq manzil kerak).

---

## Fayllar tuzilishi

```
uy-bot/
├── bot.js            → asosiy bot va server logikasi
├── store.js          → JSON-fayl asosidagi oddiy "baza"
├── webapp/
│   └── index.html    → mini-app (uylar ro'yxati)
├── data/              → avtomatik yaratiladi (foydalanuvchilar, e'lonlar)
├── package.json
├── .env.example
└── .gitignore
```

## Admin sifatida foydalanish

1. Botga shaxsiy yozing: `/start`
2. **"➕ Yangi e'lon"** tugmasini bosing → rasm yuboring → narxni kiriting
   (masalan `350000000`) → holatini tanlang (Ijarada / Sotuvda) → qisqacha
   tavsif/manzil yozing.
3. **"📋 E'lonlar ro'yxati"** orqali mavjud e'lonlarning narxi, rasmi yoki
   holatini o'zgartirishingiz yoki o'chirishingiz mumkin.

Boshqa hech bir foydalanuvchi (guruh a'zolari ham) bu buyruqlarni ishlata olmaydi —
tekshiruv `ADMIN_ID` orqali amalga oshiriladi.
