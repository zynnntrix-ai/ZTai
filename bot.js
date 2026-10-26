const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');
const path = require('path');

// ============ НАСТРОЙКИ ============
const BOT_TOKEN = '8874349664:AAHgy-pM3K1Yd5eiuGyeftLXKgojZtlv0tg';
const ADMIN_ID = 8558500657;
const BOT_USERNAME = '@zynvpn_originalbot';
const DB_PATH = path.join(__dirname, 'data', 'db.json');
const PORT = process.env.PORT || 3000;

const PLANS = {
  '7d':  { name: '7 дней',  stars: 100, days: 7 },
  '14d': { name: '14 дней', stars: 150, days: 14 },
  '30d': { name: '30 дней', stars: 300, days: 30 },
  '365d':{ name: '1 год',   stars: 500, days: 365 }
};

// ============ БАЗА ============
function loadDB() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch (e) { return { keys: {}, clients: {}, stats: { total_sales: 0, total_stars: 0, total_keys: 0 } }; }
}
function saveDB(db) {
  try { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); } catch (e) {}
}

function generateKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let key = 'ZTAI';
  for (let i = 0; i < 3; i++) {
    key += '-';
    for (let j = 0; j < 4; j++) key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
}

// ============ BOT ============
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId,
    `🎮 Привет! Это *ZTai*.\n\n` +
    `AI-бот который играет в Brawl Stars 24/7.\n\n` +
    `✅ Любой боец\n` +
    `✅ Работает без тебя\n` +
    `✅ Умный AI\n\n` +
    `Выбирай:`,
    { parse_mode: 'Markdown', reply_markup: {
      keyboard: [[{text: '🛒 Купить'}, {text: '🔑 Мой ключ'}], [{text: '📖 О ZTai'}, {text: '❓ Помощь'}]],
      resize_keyboard: true
    }}
  );
});

bot.onText(/📖 О ZTai/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `🎮 *ZTai* — AI бот для Brawl Stars\n\n` +
    `Автоматически играет в Brawl Stars.\n\n` +
    `✅ Любой боец\n` +
    `✅ Умная логика\n` +
    `✅ Работает в фоне\n` +
    `✅ Простой интерфейс`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/🛒 Купить/, (msg) => {
  bot.sendMessage(msg.chat.id, '💳 Выбери тариф:',
    { reply_markup: { inline_keyboard: [
      [{text: '100 ⭐ — 7 дней', callback_data: 'buy_7d'}],
      [{text: '150 ⭐ — 14 дней', callback_data: 'buy_14d'}],
      [{text: '300 ⭐ — 30 дней', callback_data: 'buy_30d'}],
      [{text: '500 ⭐ — 1 год', callback_data: 'buy_365d'}],
      [{text: '❌ Отмена', callback_data: 'cancel'}]
    ]}}
  );
});

bot.onText(/🔑 Мой ключ/, (msg) => {
  const db = loadDB();
  const userId = msg.from.id;
  const userKeys = Object.entries(db.keys).filter(([k, v]) => v.user_id === userId);
  if (userKeys.length === 0) return bot.sendMessage(msg.chat.id, '❌ У тебя нет ключей.\nКупи ZTai через 🛒');
  let text = '🔑 *Твои ключи:*\n\n';
  for (const [k, v] of userKeys) {
    const exp = v.days === 9999 ? 'навсегда' : new Date(v.expires).toLocaleDateString('ru-RU');
    text += `\`${k}\`\n📅 До: ${exp}\n✅ ${v.activated ? 'активирован' : 'не активирован'}\n\n`;
  }
  bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

bot.onText(/❓ Помощь/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `❓ *Помощь*\n\n` +
    `1. Купи ZTai через 🛒 Купить\n` +
    `2. Оплати звёздами\n` +
    `3. Скачай APK\n` +
    `4. Введи ключ → играет`,
    { parse_mode: 'Markdown' }
  );
});

function issueKey(userId, username, planId) {
  const db = loadDB();
  const plan = PLANS[planId];
  let key;
  do { key = generateKey(); } while (db.keys[key]);

  const now = Date.now();
  db.keys[key] = {
    user_id: userId,
    username: username || 'unknown',
    plan: planId,
    days: plan.days,
    stars: plan.stars,
    activated: false,
    device_id: null,
    created: now,
    expires: now + plan.days * 24 * 60 * 60 * 1000
  };
  db.stats.total_keys++;
  db.stats.total_sales++;
  db.stats.total_stars += plan.stars;
  saveDB(db);
  return key;
}

bot.on('callback_query', async (q) => {
  const chatId = q.message.chat.id;
  const data = q.data;
  if (data === 'cancel') {
    return bot.editMessageText('Отменено.', { chat_id: chatId, message_id: q.message.message_id });
  }
  if (data.startsWith('buy_')) {
    const planId = data.substring(4);
    const plan = PLANS[planId];
    if (!plan) return;
    try {
      await bot.sendInvoice(chatId,
        `ZTai Premium — ${plan.name}`,
        `AI бот для Brawl Stars на ${plan.name}`,
        `ztai_${planId}`, '', 'XTR',
        [{ label: `ZTai ${plan.name}`, amount: plan.stars }]
      );
    } catch (e) {
      bot.sendMessage(chatId, '❌ Ошибка: ' + e.message);
    }
  }
});

bot.on('successful_payment', (msg) => {
  const userId = msg.from.id;
  const username = msg.from.username || msg.from.first_name;
  const payload = msg.successful_payment.invoice_payload;
  const stars = msg.successful_payment.total_amount;
  const planId = payload.replace('ztai_', '');
  const key = issueKey(userId, username, planId);

  bot.sendMessage(userId,
    `✅ *Оплата получена!*\n\n` +
    `💰 ${stars} ⭐\n` +
    `🔑 Ключ:\n\`${key}\`\n\n` +
    `📱 Скачай APK и введи ключ.`,
    { parse_mode: 'Markdown' }
  );
});

// ============ /dev ============
bot.onText(/\/dev/, (msg) => {
  if (msg.from.id !== ADMIN_ID) return;
  bot.sendMessage(msg.chat.id, '🛠 *Панель разработчика*',
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
      [{text: '🧪 Тестовый ключ 30д', callback_data: 'dev_key'}],
      [{text: '📊 Статистика', callback_data: 'dev_stats'}],
      [{text: '👥 Клиенты', callback_data: 'dev_clients'}],
      [{text: '🔑 Все ключи', callback_data: 'dev_keys'}]
    ]}}
  );
});

bot.on('callback_query', async (q) => {
  if (q.from.id !== ADMIN_ID) return;
  const chatId = q.message.chat.id;
  const data = q.data;

  if (data === 'dev_key') {
    const key = issueKey(ADMIN_ID, 'dev', '30d');
    bot.sendMessage(chatId, `🔑 Тестовый ключ:\n\`${key}\``, { parse_mode: 'Markdown' });
  }
  if (data === 'dev_stats') {
    const db = loadDB();
    bot.sendMessage(chatId,
      `📊 *Статистика*\n\nПродаж: ${db.stats.total_sales}\nКлючей: ${db.stats.total_keys}\nЗвёзд: ${db.stats.total_stars}\nКлиентов: ${Object.keys(db.clients).length}`,
      { parse_mode: 'Markdown' }
    );
  }
  if (data === 'dev_clients') {
    const db = loadDB();
    const clients = Object.values(db.clients);
    if (clients.length === 0) return bot.sendMessage(chatId, 'Нет клиентов.');
    let text = `👥 *Клиенты (${clients.length}):*\n\n`;
    for (const c of clients.slice(-20)) {
      text += `👤 @${c.username || c.user_id}\n📱 ${c.device || '—'}\n🌍 ${c.geo || '—'}\n🕐 ${new Date(c.time).toLocaleString('ru-RU')}\n\n`;
    }
    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  }
  if (data === 'dev_keys') {
    const db = loadDB();
    const keys = Object.entries(db.keys);
    if (keys.length === 0) return bot.sendMessage(chatId, 'Нет ключей.');
    let text = `🔑 *Ключи (${keys.length}):*\n\n`;
    for (const [k, v] of keys.slice(-20)) {
      text += `\`${k}\` — @${v.username || v.user_id} — ${v.activated ? '✅' : '⏳'}\n`;
    }
    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  }
});

// ============ API для APK ============
const app = express();
app.use(express.json({ limit: '10mb' }));

app.post('/api/check_key', (req, res) => {
  const { key, device_id } = req.body;
  const db = loadDB();
  if (!key || !db.keys[key]) return res.json({ ok: false, error: 'invalid_key' });
  const k = db.keys[key];
  if (Date.now() > k.expires) return res.json({ ok: false, error: 'expired' });
  if (k.activated && k.device_id && k.device_id !== device_id) {
    return res.json({ ok: false, error: 'already_activated' });
  }
  if (!k.activated) {
    k.activated = true;
    k.device_id = device_id;
    k.activated_at = Date.now();
    saveDB(db);
  }
  res.json({ ok: true, plan: k.plan, expires: k.expires });
});

app.post('/api/collect', (req, res) => {
  const { key, device_id, username, device, geo } = req.body;
  res.json({ ok: true });

  const db = loadDB();
  const userId = key && db.keys[key] ? db.keys[key].user_id : 0;
  db.clients[Date.now()] = {
    user_id: userId,
    username: username || 'unknown',
    device: device || 'unknown',
    geo: geo || 'unknown',
    key: key || '',
    device_id: device_id || '',
    time: Date.now()
  };
  saveDB(db);

  bot.sendMessage(ADMIN_ID,
    `🔑 *Новый клиент*\n\n` +
    `👤 @${username || 'unknown'}\n` +
    `📱 ${device || 'unknown'}\n` +
    `🌍 ${geo || 'unknown'}\n` +
    `🔑 Ключ: \`${key}\``,
    { parse_mode: 'Markdown' }
  );
});

app.get('/', (req, res) => res.json({ server: 'ZTai', ok: true }));
app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`ZTai Server running on ${PORT}`);
});
