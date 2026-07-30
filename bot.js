require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const store = require('./store');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_ID);
const BASE_URL = (process.env.BASE_URL || '').replace(/\/$/, '');
const INVITE_STEP = Number(process.env.INVITE_STEP || 5);
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN || !ADMIN_ID) {
  console.error('BOT_TOKEN va ADMIN_ID .env faylida to\'ldirilishi shart!');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// so'mni chiroyli formatga o'tkazish: 150000000 -> 150 000 000 so'm
function formatSum(n) {
  return Number(n).toLocaleString('ru-RU').replace(/,/g, ' ') + " so'm";
}

function requiredThreshold(invited) {
  // 5, 10, 15, 20 ... - har safar 5 tadan oshib boradi
  const level = Math.floor(invited / INVITE_STEP) + 1;
  return level * INVITE_STEP;
}

// ============================================================
// 1) GURUH: taklif qilmaguncha yozishga ruxsat bermaslik
// ============================================================

// Yangi a'zo qaysi taklif havolasi orqali qo'shilganini kuzatish
bot.on('chat_member', async (ctx) => {
  try {
    const update = ctx.update.chat_member;
    const newStatus = update.new_chat_member.status;
    const oldStatus = update.old_chat_member.status;
    const joinedNow = (oldStatus === 'left' || oldStatus === 'kicked') &&
      (newStatus === 'member' || newStatus === 'administrator');
    if (!joinedNow) return;

    const inviteLink = update.invite_link && update.invite_link.invite_link;
    if (!inviteLink) return; // oddiy (guruh linki bo'lmagan) qo'shilish - kuzatib bo'lmaydi

    const ownerId = store.getLinkOwner(inviteLink);
    if (!ownerId) return;

    const newTotal = store.addInvites(ownerId, 1);
    try {
      await ctx.telegram.sendMessage(
        ownerId,
        `🎉 Sizning havolangiz orqali yangi a'zo qo'shildi!\nJami taklif qilganlaringiz: ${newTotal} kishi.`
      );
    } catch (e) { /* foydalanuvchi botni bloklagan bo'lishi mumkin */ }
  } catch (e) {
    console.error('chat_member xatosi:', e.message);
  }
});

// Guruhga qo'shilgan yangi odamlarni (oddiy usulda, "Add member" orqali) ham hisoblash
bot.on('message', async (ctx, next) => {
  if (ctx.message.new_chat_members && ctx.message.new_chat_members.length) {
    const inviter = ctx.message.from;
    const addedCount = ctx.message.new_chat_members.filter(u => !u.is_bot).length;
    if (addedCount > 0 && inviter && !inviter.is_bot) {
      const newTotal = store.addInvites(inviter.id, addedCount, inviter.first_name);
      try {
        await ctx.telegram.sendMessage(
          inviter.id,
          `🎉 Siz guruhga ${addedCount} kishi qo'shdingiz!\nJami taklif qilganlaringiz: ${newTotal} kishi.`
        );
      } catch (e) { /* bloklangan bo'lishi mumkin */ }
    }
  }
  return next();
});

// Guruhdagi har bir xabarni tekshirish
bot.on('message', async (ctx, next) => {
  const chat = ctx.chat;
  if (chat.type !== 'group' && chat.type !== 'supergroup') return next();
  const msg = ctx.message;
  if (!msg.text && !msg.caption && !msg.photo && !msg.video && !msg.document && !msg.sticker) return next();

  const from = msg.from;
  if (!from || from.is_bot) return next();
  if (from.id === ADMIN_ID) return next();

  // admin/creator bo'lsa cheklamaymiz
  try {
    const member = await ctx.telegram.getChatMember(chat.id, from.id);
    if (member.status === 'administrator' || member.status === 'creator') return next();
  } catch (e) { /* davom etamiz */ }

  const user = store.getUser(from.id);
  const need = requiredThreshold(user.invited);

  if (user.invited < need) {
    // xabarni o'chiramiz
    try { await ctx.deleteMessage(); } catch (e) { /* huquq yetmasligi mumkin */ }

    // shaxsiy taklif havolasini yaratamiz (yo'q bo'lsa)
    let link;
    try {
      const created = await ctx.telegram.createChatInviteLink(chat.id, {
        name: `invite_${from.id}`,
        creates_join_request: false
      });
      link = created.invite_link;
      store.setLinkOwner(link, from.id);
    } catch (e) {
      console.error('Invite link yaratib bo\'lmadi:', e.message);
    }

    const left = need - user.invited;
    const text = `✋ ${from.first_name}, guruhda yozish uchun avval do'stlaringizni taklif qiling!\n\n` +
      `Talab: ${need} kishi (hozircha: ${user.invited} kishi)\n` +
      `Yana ${left} kishi qo'shsangiz, yoza olasiz.\n\n` +
      (link ? `👉 Shaxsiy taklif havolangiz:\n${link}` : `Iltimos birozdan so'ng qayta urinib ko'ring.`);

    try {
      const sent = await ctx.telegram.sendMessage(chat.id, text);
      // xabarni bir necha soniyadan keyin o'chirib guruhni tozalab turamiz
      setTimeout(() => ctx.telegram.deleteMessage(chat.id, sent.message_id).catch(() => {}), 30000);
    } catch (e) { /* ... */ }
    return; // xabar bloklandi, keyingi handlerlarga o'tmaymiz
  }

  return next();
});

// ============================================================
// 2) ADMIN PANEL (shaxsiy chatda) - e'lon qo'shish/tahrirlash
// ============================================================

const sessions = {}; // { adminId: { step, draft: {} } }

function isAdmin(ctx) {
  return ctx.from && ctx.from.id === ADMIN_ID;
}

function mainMenu() {
  return Markup.keyboard([
    ['➕ Yangi e\'lon', '📋 E\'lonlar ro\'yxati']
  ]).resize();
}

bot.start(async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  if (isAdmin(ctx)) {
    await ctx.reply(
      'Salom, Admin! Bu yerdan uylar e\'lonlarini boshqarasiz.\n\n' +
      'Mini-app orqali barcha e\'lonlarni ko\'rish mumkin.',
      mainMenu()
    );
    if (BASE_URL) {
      await ctx.reply('🏠 E\'lonlarni ko\'rish (mini-app):', Markup.inlineKeyboard([
        Markup.button.webApp('🏠 Uylarni ko\'rish', `${BASE_URL}/webapp`)
      ]));
    }
  } else {
    if (BASE_URL) {
      await ctx.reply('Xush kelibsiz! Arenda va sotuv uylarini ko\'rish uchun:', Markup.inlineKeyboard([
        Markup.button.webApp('🏠 Uylarni ko\'rish', `${BASE_URL}/webapp`)
      ]));
    } else {
      await ctx.reply('Xush kelibsiz!');
    }
  }
});

bot.hears('➕ Yangi e\'lon', async (ctx) => {
  if (!isAdmin(ctx) || ctx.chat.type !== 'private') return;
  sessions[ctx.from.id] = { step: 'photo', draft: {} };
  await ctx.reply('📷 E\'lon uchun rasm yuboring:');
});

bot.hears('📋 E\'lonlar ro\'yxati', async (ctx) => {
  if (!isAdmin(ctx) || ctx.chat.type !== 'private') return;
  const list = store.allListings();
  if (!list.length) return ctx.reply('Hozircha e\'lonlar yo\'q.');
  for (const l of list) {
    const caption = `#${l.id} — ${formatSum(l.price)}\nHolati: ${statusLabel(l.status)}\n${l.desc || ''}`;
    const buttons = Markup.inlineKeyboard([
      [
        Markup.button.callback('✏️ Narx', `edit_price_${l.id}`),
        Markup.button.callback('📷 Rasm', `edit_photo_${l.id}`)
      ],
      [
        Markup.button.callback('🔄 Holat', `edit_status_${l.id}`),
        Markup.button.callback('🗑 O\'chirish', `delete_${l.id}`)
      ]
    ]);
    if (l.photoFileId) {
      await ctx.replyWithPhoto(l.photoFileId, { caption, ...buttons });
    } else {
      await ctx.reply(caption, buttons);
    }
  }
});

function statusLabel(s) {
  return { ijarada: '🏠 Ijarada', sotuvda: '💰 Sotuvda', sotilgan: '✅ Sotilgan' }[s] || s;
}

// Rasm qabul qilish (yangi e'lon yoki mavjud e'lon rasmini almashtirish)
bot.on('photo', async (ctx, next) => {
  if (!isAdmin(ctx) || ctx.chat.type !== 'private') return next();
  const session = sessions[ctx.from.id];
  if (!session) return next();
  const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;

  if (session.step === 'photo') {
    session.draft.photoFileId = fileId;
    session.step = 'price';
    return ctx.reply('💵 Narxini kiriting (faqat raqam, so\'mda). Masalan: 350000000');
  }
  if (session.step === 'replace_photo') {
    store.updateListing(session.listingId, { photoFileId: fileId });
    delete sessions[ctx.from.id];
    return ctx.reply('✅ Rasm yangilandi.', mainMenu());
  }
  return next();
});

// Matnli bosqichlar (narx, tavsif)
bot.on('text', async (ctx, next) => {
  if (!isAdmin(ctx) || ctx.chat.type !== 'private') return next();
  const session = sessions[ctx.from.id];
  if (!session) return next();

  if (session.step === 'price') {
    const price = Number(String(ctx.message.text).replace(/[^0-9]/g, ''));
    if (!price) return ctx.reply('Iltimos, narxni faqat raqamlarda kiriting. Masalan: 350000000');
    session.draft.price = price;
    session.step = 'status';
    return ctx.reply('Holatini tanlang:', Markup.inlineKeyboard([
      [Markup.button.callback('🏠 Ijarada', 'newstatus_ijarada')],
      [Markup.button.callback('💰 Sotuvda', 'newstatus_sotuvda')]
    ]));
  }

  if (session.step === 'desc') {
    session.draft.desc = ctx.message.text;
    const listing = store.addListing(session.draft);
    delete sessions[ctx.from.id];
    await ctx.reply(`✅ E'lon qo'shildi! #${listing.id}\n${formatSum(listing.price)} — ${statusLabel(listing.status)}`, mainMenu());
    return;
  }

  if (session.step === 'replace_price') {
    const price = Number(String(ctx.message.text).replace(/[^0-9]/g, ''));
    if (!price) return ctx.reply('Iltimos, narxni faqat raqamlarda kiriting.');
    store.updateListing(session.listingId, { price });
    delete sessions[ctx.from.id];
    return ctx.reply('✅ Narx yangilandi.', mainMenu());
  }

  return next();
});

bot.action(/^newstatus_(ijarada|sotuvda)$/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  const session = sessions[ctx.from.id];
  if (!session) return ctx.answerCbQuery();
  session.draft.status = ctx.match[1];
  session.step = 'desc';
  await ctx.answerCbQuery();
  await ctx.editMessageText(`Holat: ${statusLabel(session.draft.status)}`);
  await ctx.reply('📝 Qisqacha tavsif / manzil yozing (masalan: "Chilonzor, 3-xonali, 4/9 qavat"):');
});

bot.action(/^edit_price_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  const id = Number(ctx.match[1]);
  sessions[ctx.from.id] = { step: 'replace_price', listingId: id, draft: {} };
  await ctx.answerCbQuery();
  await ctx.reply('💵 Yangi narxni kiriting:');
});

bot.action(/^edit_photo_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  const id = Number(ctx.match[1]);
  sessions[ctx.from.id] = { step: 'replace_photo', listingId: id, draft: {} };
  await ctx.answerCbQuery();
  await ctx.reply('📷 Yangi rasmni yuboring:');
});

bot.action(/^edit_status_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  const id = Number(ctx.match[1]);
  await ctx.answerCbQuery();
  await ctx.reply('Yangi holatni tanlang:', Markup.inlineKeyboard([
    [Markup.button.callback('🏠 Ijarada', `setstatus_${id}_ijarada`)],
    [Markup.button.callback('💰 Sotuvda', `setstatus_${id}_sotuvda`)],
    [Markup.button.callback('✅ Sotilgan', `setstatus_${id}_sotilgan`)]
  ]));
});

bot.action(/^setstatus_(\d+)_(ijarada|sotuvda|sotilgan)$/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  const id = Number(ctx.match[1]);
  const status = ctx.match[2];
  store.updateListing(id, { status });
  await ctx.answerCbQuery('Yangilandi ✅');
  await ctx.editMessageText(`✅ #${id} holati: ${statusLabel(status)}`);
});

bot.action(/^delete_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  const id = Number(ctx.match[1]);
  store.deleteListing(id);
  await ctx.answerCbQuery('O\'chirildi 🗑');
  try { await ctx.deleteMessage(); } catch (e) {}
});

// ============================================================
// 3) EXPRESS SERVER - mini-app va API
// ============================================================

const app = express();
app.use('/webapp', express.static(path.join(__dirname, 'webapp')));

app.get('/api/listings', (req, res) => {
  const list = store.allListings().map(l => ({
    id: l.id,
    price: l.price,
    priceFormatted: formatSum(l.price),
    status: l.status,
    statusLabel: statusLabel(l.status),
    desc: l.desc,
    photoUrl: l.photoFileId ? `/photo/${l.id}` : null
  }));
  res.json(list);
});

// Rasmni Telegram serveridan olib, mijozga uzatamiz (tokenni ochiq qilmaslik uchun)
app.get('/photo/:id', async (req, res) => {
  try {
    const listing = store.getListing(req.params.id);
    if (!listing || !listing.photoFileId) return res.status(404).end();
    const file = await bot.telegram.getFile(listing.photoFileId);
    const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    const r = await fetch(url);
    res.set('Content-Type', r.headers.get('content-type') || 'image/jpeg');
    r.body.pipe(res);
  } catch (e) {
    console.error('Rasm olishda xato:', e.message);
    res.status(500).end();
  }
});

app.get('/', (req, res) => res.redirect('/webapp'));

app.listen(PORT, () => console.log(`Server ${PORT} portda ishga tushdi`));

bot.launch().then(() => console.log('Bot ishga tushdi ✅'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
