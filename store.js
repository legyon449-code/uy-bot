// Oddiy fayl-asosli "baza". Kichik botlar uchun SQLite o'rniga shu yetarli.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const LISTINGS_FILE = path.join(DATA_DIR, 'listings.json');
const LINKS_FILE = path.join(DATA_DIR, 'invite_links.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf-8').trim();
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.error('JSON o\'qishda xatolik:', file, e.message);
    return fallback;
  }
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

// ---------- Foydalanuvchilar (taklif hisoblagichi) ----------
let users = loadJSON(USERS_FILE, {}); // { userId: { invited: 0, name: '' } }

function getUser(userId) {
  if (!users[userId]) {
    users[userId] = { invited: 0, name: '' };
    saveJSON(USERS_FILE, users);
  }
  return users[userId];
}

function addInvites(userId, count, name) {
  const u = getUser(userId);
  u.invited += count;
  if (name) u.name = name;
  saveJSON(USERS_FILE, users);
  return u.invited;
}

// ---------- Taklif havolalari: link -> egasining userId si ----------
let links = loadJSON(LINKS_FILE, {}); // { inviteLink: userId }

function setLinkOwner(link, userId) {
  links[link] = userId;
  saveJSON(LINKS_FILE, links);
}

function getLinkOwner(link) {
  return links[link];
}

// ---------- E'lonlar (uy/kvartira) ----------
let listings = loadJSON(LISTINGS_FILE, []); // [{id, photoFileId, price, status, desc, createdAt}]

function nextId() {
  return listings.length ? Math.max(...listings.map(l => l.id)) + 1 : 1;
}

function addListing(data) {
  const listing = {
    id: nextId(),
    photoFileId: data.photoFileId || null,
    price: data.price || 0,
    status: data.status || 'ijarada', // 'ijarada' | 'sotuvda' | 'sotilgan'
    desc: data.desc || '',
    createdAt: Date.now()
  };
  listings.push(listing);
  saveJSON(LISTINGS_FILE, listings);
  return listing;
}

function getListing(id) {
  return listings.find(l => l.id === Number(id));
}

function updateListing(id, patch) {
  const l = getListing(id);
  if (!l) return null;
  Object.assign(l, patch);
  saveJSON(LISTINGS_FILE, listings);
  return l;
}

function deleteListing(id) {
  const before = listings.length;
  listings = listings.filter(l => l.id !== Number(id));
  saveJSON(LISTINGS_FILE, listings);
  return listings.length !== before;
}

function allListings() {
  return listings.slice().sort((a, b) => b.createdAt - a.createdAt);
}

module.exports = {
  getUser, addInvites,
  setLinkOwner, getLinkOwner,
  addListing, getListing, updateListing, deleteListing, allListings
};
