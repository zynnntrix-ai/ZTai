require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');
const path = require('path');

// --- НАСТРОЙКИ ---
const TOKEN = '8874349664:AAHgy-pM3K1Yd5eiuGyeftLXKgojZtlv0tg';
const ADMIN_ID = 8558500657;
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
    fs.writeFileSync(DB_PATH, JSON.stringify({ keys: {}, clients: {}, stats: { total_keys: 0, total_sales: 0, total_stars: 0 } }, null, 2));
}

function loadDB() {
    try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
    catch (e) { return { keys: {}, clients: {}, stats: { total_keys: 0, total_sales: 0, total_stars: 0 } }; }
}
function saveDB(db) { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

// --- ТАРИФЫ ---
const PLANS = {
    '1h': { name: 'Тест 1 час', days: 1/24, stars: 0 },
    '1d': { name: 'Тест 1 день', days: 1, stars: 0 },
    '1w': { name: 'Тест 1 неделя', days: 7, stars: 0 },
    '1m': { name: 'Тест 1 месяц', days: 30, stars: 0 },
    '100': { name: '100 Stars', days: 30, stars: 100 },
    '150': { name: '150 Stars', days: 30, stars: 150 },
    '300': { name: '300 Stars', days: 30, stars: 300 },
    '500': { name: '500 Stars', days: 30, stars: 500 }
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
    bot.sendMessage(chatId, '👋 Добро пожаловать в *ZTai*!\n\nКупи ключ, чтобы начать играть.', {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🛒 Купить', callback_data: 'buy' }],
                [{ text: '🔑 Мой ключ', callback_data: 'my_key' }],
                [{ text: 'ℹ️ О ZTai', callback_data: 'about' }],
                [{ text: '❓ Помощь', callback_data: 'help' }]
            ]
        }
    });
});

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
                [{ text: '🔑 Все ключи', callback_data: 'dev_keys' }]
            ]
        }
    });
});

// --- БОТ: ОБРАБОТКА КНОПОК ---
bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const data = q.data;

    if (data === 'buy') {
        bot.sendMessage(chatId, 'Выберите тариф:', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '100 Stars (30 дней)', callback_data: 'buy_100' }],
                    [{ text: '150 Stars (30 дней)', callback_data: 'buy_150' }],
                    [{ text: '300 Stars (30 дней)', callback_data: 'buy_300' }],
                    [{ text: '500 Stars (30 дней)', callback_data: 'buy_500' }]
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
        const db = loadDB();
        const userKeys = Object.entries(db.keys).filter(([k, v]) => v.user_id === chatId && v.plan.startsWith('1') === false);
        
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
        bot.sendMessage(chatId, '🤖 ZTai — AI-бот для Brawl Stars.\nАвтоматически играет, умная логика, работает в фоне.');
    } else if (data === 'help') {
        bot.sendMessage(chatId, '❓ Если возникли проблемы с активацией ключа, напишите в поддержку: @your_support');
    } else if (data.startsWith('dev_key_')) {
        if (chatId !== ADMIN_ID) return;
        const planId = data.replace('dev_key_', '');
        const key = issueKey(ADMIN_ID, 'admin', planId);
        bot.sendMessage(chatId, `✅ Тестовый ключ (${PLANS[planId].name}):\n\`${key}\``, { parse_mode: 'Markdown' });
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
        saveDB(db);
    }
    
    res.json({ ok: true, plan: k.plan, expires: k.expires });
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
    console.log(`ZTai Server running on ${PORT}`);
});

console.log('ZTai Bot is running...');
