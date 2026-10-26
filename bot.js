require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');
const path = require('path');

// --- НАСТРОЙКИ ---
const TOKEN = '8874349664:AAHgy-pM3K1Yd5eiuGyeftLXKgojZtlv0tg';
const ADMIN_ID = 8558500657;
const SUPPORT_USERNAME = '@zynnntrix';
const PORT = process.env.PORT || 8080;

const bot = new TelegramBot(TOKEN, { polling: true });
const app = express();
app.use(express.json());

// --- БАЗА ДАННЫХ ---
const DB_PATH = path.join(__dirname, 'data', 'db.json');
if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}
if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ keys: {}, clients: {}, promos: {}, stats: { total_keys: 0, total_sales: 0, total_stars: 0 } }, null, 2));
}

function loadDB() {
    try { 
        let db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); 
        if (!db.promos) db.promos = {};
        return db;
    }
    catch (e) { return { keys: {}, clients: {}, promos: {}, stats: { total_keys: 0, total_sales: 0, total_stars: 0 } }; }
}
function saveDB(db) { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

// --- ТАРИФЫ ---
const PLANS = {
    '1h': { name: 'Тест 1 час', days: 1/24, stars: 0 },
    '1d': { name: 'Тест 1 день', days: 1, stars: 0 },
    '1w': { name: 'Тест 1 неделя', days: 7, stars: 0 },
    '1m': { name: 'Тест 1 месяц', days: 30, stars: 0 },
    
    '7d': { name: '7 дней', days: 7, stars: 200 },
    '14d': { name: '14 дней', days: 14, stars: 350 },
    '30d': { name: '30 дней', days: 30, stars: 680 },
    'inf': { name: 'Навсегда', days: 36500, stars: 1750 }
};

function generateKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let res = 'ZTAI-';
    for (let i = 0; i < 4; i++) res += chars.charAt(Math.floor(Math.random() * chars.length));
    res += '-';
    for (let i = 0; i < 4; i++) res += chars.charAt(Math.floor(Math.random() * chars.length));
    res += '-';
    for (let i = 0; i < 4; i++) res += chars.charAt(Math.floor(Math.random() * chars.length));
    return res;
}

function issueKey(userId, username, planId) {
    const db = loadDB();
    const plan = PLANS[planId];
    if (!plan) return null;
    
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
    if (plan.stars > 0) {
        db.stats.total_sales++;
        db.stats.total_stars += plan.stars;
    }
    saveDB(db);
    return key;
}

// --- БОТ: КОМАНДЫ ---
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const text = `👋 *Добро пожаловать в ZTai!*\n\n` +
        `🤖 ZTai — это умный AI-бот для Brawl Stars.\n` +
        `Он автоматически играет за тебя, используя экранный анализ и тапы.\n\n` +
        `📌 *Что умеет бот:*\n` +
        `✅ Поддержка любого бойца\n` +
        `✅ Умная логика боя\n` +
        `✅ Работает в фоне\n` +
        `✅ Простой интерфейс\n\n` +
        `🛒 Нажми "Купить", чтобы выбрать тариф.\n` +
        `🎁 Если у тебя есть промокод, введи /promo КОД`;

    bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🛒 Купить ключ', callback_data: 'buy' }],
                [{ text: '🔑 Мой ключ', callback_data: 'my_key' }],
                [{ text: 'ℹ️ О ZTai', callback_data: 'about' }],
                [{ text: '🆘 Поддержка', url: `https://t.me/${SUPPORT_USERNAME.replace('@', '')}` }]
            ]
        }
    });
});

// Команда /promo
bot.onText(/\/promo (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const promoCode = match[1].trim().toUpperCase();
    const db = loadDB();

    if (!db.promos[promoCode]) {
        return bot.sendMessage(chatId, '❌ Такого промокода не существует.');
    }

    const promo = db.promos[promoCode];
    if (promo.uses >= promo.max_uses) {
        return bot.sendMessage(chatId, '❌ Этот промокод уже закончился.');
    }

    // Выдаем ключ
    const key = issueKey(chatId, msg.from.username || 'promo_user', promo.plan);
    promo.uses++;
    saveDB(db);

    bot.sendMessage(chatId, `✅ Промокод активирован!\n\n🔑 Твой ключ:\n\`${key}\`\n\nСрок действия: ${PLANS[promo.plan].name}`, { parse_mode: 'Markdown' });
});

// Админ-панель /dev
bot.onText(/\/dev/, (msg) => {
    if (msg.from.id !== ADMIN_ID) return;
    bot.sendMessage(msg.chat.id, '🛠 *Панель разработчика*', {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '⏱ Тест 1 час', callback_data: 'dev_key_1h' }],
                [{ text: '📅 Тест 1 день', callback_data: 'dev_key_1d' }],
                [{ text: '🗓 Тест 1 неделя', callback_data: 'dev_key_1w' }],
                [{ text: '📆 Тест 1 месяц', callback_data: 'dev_key_1m' }],
                [{ text: '📊 Статистика', callback_data: 'dev_stats' }],
                [{ text: '🔑 Все ключи', callback_data: 'dev_keys' }],
                [{ text: '👥 Клиенты', callback_data: 'dev_clients' }],
                [{ text: '🎁 Создать промокод', callback_data: 'dev_create_promo' }]
            ]
        }
    });
});

// Создание промокода (текстовый ввод)
bot.onText(/\/newpromo (.+) (.+) (.+)/, (msg, match) => {
    if (msg.from.id !== ADMIN_ID) return;
    const code = match[1].toUpperCase();
    const planId = match[2]; // например '7d', '30d'
    const maxUses = parseInt(match[3]);

    if (!PLANS[planId] || !PLANS[planId].stars === 0) {
        return bot.sendMessage(msg.chat.id, '❌ Неверный формат. Используй: /newpromo КОД 7d 10 (код, тариф, кол-во активаций)');
    }

    const db = loadDB();
    db.promos[code] = { plan: planId, uses: 0, max_uses: maxUses };
    saveDB(db);

    bot.sendMessage(msg.chat.id, `✅ Промокод \`${code}\` создан!\nТариф: ${PLANS[planId].name}\nЛимит: ${maxUses} активаций.`, { parse_mode: 'Markdown' });
});

// --- БОТ: ОБРАБОТКА КНОПОК ---
bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const data = q.data;
    const db = loadDB();

    if (data === 'buy') {
        bot.sendMessage(chatId, 'Выберите тариф:', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🟢 7 дней — 200 ⭐', callback_data: 'buy_7d' }],
                    [{ text: '🔵 14 дней — 350 ⭐', callback_data: 'buy_14d' }],
                    [{ text: '🟣 30 дней — 680 ⭐', callback_data: 'buy_30d' }],
                    [{ text: '💎 Навсегда — 1750 ⭐', callback_data: 'buy_inf' }]
                ]
            }
        });
    } else if (data.startsWith('buy_')) {
        const planId = data.substring(4);
        const plan = PLANS[planId];
        if (!plan) return;

        try {
            await bot.sendInvoice(chatId,
                `ZTai Premium — ${plan.name}`,
                `AI-бот для Brawl Stars на ${plan.days} дней`,
                `ztai_${planId}`, '', 'XTR',
                [{ label: `ZTai ${plan.name}`, amount: plan.stars }]
            );
        } catch (e) {
            bot.sendMessage(chatId, '❌ Ошибка: ' + e.message);
        }
    } else if (data === 'my_key') {
        const userKeys = Object.entries(db.keys).filter(([k, v]) => v.user_id === chatId && !['1h','1d','1w','1m'].includes(v.plan));
        
        if (userKeys.length === 0) {
            bot.sendMessage(chatId, '❌ У тебя нет купленных ключей.');
        } else {
            let msg = '🔑 *Твои ключи:*\n\n';
            userKeys.forEach(([k, v]) => {
                const expDate = new Date(v.expires).toLocaleString();
                msg += `\`${k}\`\nДо: ${expDate}\n\n`;
            });
            bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
        }
    } else if (data === 'about') {
        bot.sendMessage(chatId, '🤖 *ZTai* — это AI-бот для Brawl Stars.\n\nВерсия: 1.0.0\nРазработчик: @zynnntrix', { parse_mode: 'Markdown' });
    
    // --- ФУНКЦИИ ДЛЯ /DEV ---
    } else if (data.startsWith('dev_key_')) {
        if (chatId !== ADMIN_ID) return;
        const planId = data.replace('dev_key_', '');
        const key = issueKey(ADMIN_ID, 'admin', planId);
        bot.sendMessage(chatId, `✅ Тестовый ключ (${PLANS[planId].name}):\n\`${key}\``, { parse_mode: 'Markdown' });
    
    } else if (data === 'dev_stats') {
        if (chatId !== ADMIN_ID) return;
        const s = db.stats;
        const msg = `📊 *Статистика ZTai*\n\n` +
            `🔑 Всего создано ключей: ${s.total_keys}\n` +
            `💰 Всего продаж: ${s.total_sales}\n` +
            `⭐ Всего звезд: ${s.total_stars}\n\n` +
            `👥 Пользователей в базе: ${Object.keys(db.clients).length}`;
        bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });

    } else if (data === 'dev_keys') {
        if (chatId !== ADMIN_ID) return;
        const keys = Object.entries(db.keys);
        if (keys.length === 0) {
            bot.sendMessage(chatId, 'Ключей пока нет.');
        } else {
            let msg = '🔑 *Последние 20 ключей:*\n\n';
            keys.slice(-20).reverse().forEach(([k, v]) => {
                const status = v.activated ? '✅' : '⏳';
                msg += `${status} \`${k}\` | ${v.plan} | ${new Date(v.expires).toLocaleDateString()}\n`;
            });
            bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
        }

    } else if (data === 'dev_clients') {
        if (chatId !== ADMIN_ID) return;
        const clients = Object.entries(db.clients);
        if (clients.length === 0) {
            bot.sendMessage(chatId, 'Клиентов пока нет.');
        } else {
            let msg = '👥 *Последние 10 клиентов:*\n\n';
            clients.slice(-10).reverse().forEach(([id, c]) => {
                msg += `👤 @${c.username} (ID: ${c.user_id})\n📱 ${c.device || 'unknown'}\n🔑 ${c.key}\n\n`;
            });
            bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
        }
    } else if (data === 'dev_create_promo') {
        if (chatId !== ADMIN_ID) return;
        bot.sendMessage(chatId, 'Введи команду в формате:\n`/newpromo КОД ТАРИФ КОЛИЧЕСТВО`\n\nНапример: `/newpromo ZYNN7D 7d 10` (код ZYNN7D, тариф 7 дней, 10 активаций).', { parse_mode: 'Markdown' });
    }
});

// --- БОТ: ОПЛАТА ---
bot.on('successful_payment', (msg) => {
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name || 'unknown';
    const payload = msg.successful_payment.invoice_payload;
    const stars = msg.successful_payment.total_amount;
    const planId = payload.replace('ztai_', '');
    const plan = PLANS[planId];
    
    if (!plan) return;
    const key = issueKey(userId, username, planId);

    bot.sendMessage(userId,
        `✅ *Оплата получена!*\n\n` +
        `⭐ ${stars} звезд\n` +
        `🔑 Ключ:\n\`${key}\`\n\n` +
        `Скачай APK и введи ключ.`,
        { parse_mode: 'Markdown' }
    );

    bot.sendMessage(ADMIN_ID,
        `💰 *НОВАЯ ПОКУПКА!*\n\n` +
        `👤 Юзер: @${username} (ID: ${userId})\n` +
        `📦 Тариф: ${plan.name}\n` +
        `⭐ Звезд: ${stars}\n` +
        `🔑 Ключ: \`${key}\``,
        { parse_mode: 'Markdown' }
    );
});

// --- API ДЛЯ ПРИЛОЖЕНИЯ ---
app.post('/api/check_key', (req, res) => {
    const { key, device_id } = req.body;
    const db = loadDB();
    
    if (!key || !db.keys[key]) {
        return res.json({ ok: false, error: 'invalid_key' });
    }
    
    const k = db.keys[key];
    if (Date.now() > k.expires) {
        return res.json({ ok: false, error: 'expired' });
    }
    
    if (!k.activated) {
        k.activated = true;
        k.device_id = device_id;
        k.activated_at = Date.now();
        
        db.clients[Date.now()] = {
            user_id: k.user_id,
            username: k.username,
            device: device_id,
            key: key,
            plan: k.plan,
            time: Date.now()
        };
        saveDB(db);
    }
    
    res.json({ ok: true, plan: k.plan, expires: k.expires });
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
    console.log(`ZTai Server running on ${PORT}`);
});

console.log('ZTai Bot is running...');
