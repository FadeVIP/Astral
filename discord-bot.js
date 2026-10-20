/**
 * =========================================================================
 * ASTRAL CHAT & TICKETS <-> DISCORD BIDIRECTIONAL BRIDGE BOT
 * Двусторонний мост между Discord и сайтом Astral RPG (Чат + FAQ/Тикеты)
 * =========================================================================
 * 
 * ВОЗМОЖНОСТИ:
 * 1. ЧАТ (Сайт ⇄ Discord):
 *    - Сообщения из чата сайта мгновенно пересылаются в канал Discord с пометкой [Сайт].
 *    - Сообщения из Discord попадают в эфир на сайте со значком и бейджем Discord.
 *    - Защита от бесконечного цикла сообщений (fromDiscord: true).
 * 
 * 2. ТИКЕТЫ И FAQ (Сайт ⇄ Discord):
 *    - При создании вопроса/тикета на сайте бот присылает красивый Embed в канал тикетов
 *      и автоматически открывает персональную ветку (Thread).
 *    - Администратор может ответить прямо в ветке или командой: !reply <ID_тикета> <ответ>.
 *    - Ответ моментально записывается в базу и отображается пользователю на сайте со статусом «Отвечен».
 *    - Команда закрытия тикета: !close <ID_тикета>.
 *
 * 3. MinePass (сервер → Discord):
 *    - Подтверждённые события из Firebase/minepass/announcements публикуются
 *      в отдельный канал DISCORD_MINEPASS_CHANNEL_ID.
 * 
 * ИНСТРУКЦИЯ ПО НАСТРОЙКЕ:
 * 1. Установите зависимости (если ещё не установлены):
 *      npm install discord.js firebase-admin
 * 
 * 2. Скачайте ключ базы данных Firebase:
 *      Firebase Console -> Project Settings -> Service Accounts -> "Generate new private key".
 *      Сохраните как serviceAccountKey.json рядом с этим скриптом.
 * 
 * 3. Создайте бота в Discord Developer Portal:
 *      - https://discord.com/developers/applications
 *      - Создайте Application -> вкладка "Bot" -> скопируйте Token (DISCORD_BOT_TOKEN).
 *      - Включите "MESSAGE CONTENT INTENT" и "SERVER MEMBERS INTENT" во вкладке Bot.
 *      - Во вкладке OAuth2 -> URL Generator выберите права: "bot", "Send Messages", 
 *        "Embed Links", "Read Message History", "Create Public Threads", "Send Messages in Threads".
 * 
 * 4. Заполните переменные окружения или поля ниже и запустите:
 *      node discord-bot.js
 *    Для отдельного канала достижений добавьте:
 *      DISCORD_MINEPASS_CHANNEL_ID=ID_КАНАЛА
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { Client, GatewayIntentBits, EmbedBuilder, Partials, ActivityType } = require('discord.js');
const admin = require('firebase-admin');

// Автозагрузка переменных из .env (если файл существует)
try {
  const envPath = path.resolve(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envLines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of envLines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match && !match[1].startsWith('#')) {
        const k = match[1].trim();
        let v = (match[2] || '').trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (!process.env[k]) process.env[k] = v;
      }
    }
  }
} catch (e) {}

// --- НАСТРОЙКИ ---
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || 'ВСТАВЬТЕ_ТОКЕН_БОТА_DISCORD';
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || 'ВСТАВЬТЕ_ID_КАНАЛА_ЧАТА';
// Если отдельный канал для тикетов не указан, используется основной канал чата
const DISCORD_TICKETS_CHANNEL_ID = process.env.DISCORD_TICKETS_CHANNEL_ID || DISCORD_CHANNEL_ID;
// Отдельный канал для подтверждённых достижений MinePass (не чат и не тикеты).
const DISCORD_MINEPASS_CHANNEL_ID = process.env.DISCORD_MINEPASS_CHANNEL_ID || '';
const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL || 'https://astral-524a1-default-rtdb.europe-west1.firebasedatabase.app';

// 1. Инициализация Firebase Admin
let db = null;
try {
  let credential = null;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    credential = admin.credential.cert(parsed);
  } else {
    try {
      const serviceAccount = require('./serviceAccountKey.json');
      credential = admin.credential.cert(serviceAccount);
    } catch (e) {
      console.warn('[Firebase] Файл serviceAccountKey.json не найден в папке бота.');
    }
  }

  if (credential) {
    admin.initializeApp({
      credential: credential,
      databaseURL: FIREBASE_DATABASE_URL
    });
    db = admin.database();
    console.log('✦ [Firebase] Успешно подключено к Realtime Database');
  } else {
    console.warn('⚠️ [Firebase] Сервисный ключ не загружен! Бот не сможет читать/писать в базу данных.');
    console.warn('   Поместите файл serviceAccountKey.json рядом с discord-bot.js или задайте переменную FIREBASE_SERVICE_ACCOUNT.');
  }
} catch (e) {
  console.error('[Firebase Error] Ошибка инициализации:', e.message);
}

const publicData=require('./public-data.cjs').start(admin,db);

// 2. HTTP Health-check сервер (для Render, Railway, Glitch, Koyeb и внешних пинг-сервисов)
const PORT = process.env.PORT || 3000;

const httpServer = http.createServer((req, res) => {
  const reqUrl = req.url || '/';
  if (reqUrl === '/health' || reqUrl === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      status: 'ok',
      uptimeSec: Math.round(process.uptime()),
      heartbeatCount,
      packOnline,
      packReports,
      publicData,
      discordPing: (client && client.ws) ? client.ws.ping : -1,
      botUser: (client && client.user) ? client.user.tag : 'connecting',
      timestamp: Date.now()
    }));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`✦ Astral Discord <-> Web Bridge is Active!\nUptime: ${Math.round(process.uptime())}s | Discord Ping: ${(client && client.ws) ? client.ws.ping : -1}ms | Pulses: ${heartbeatCount}\n`);
  }
});

httpServer.listen(PORT, () => {
  console.log(`✦ [Health-Check] HTTP пинг-сервер запущен на порту ${PORT}`);
  startKeepAliveSystem();
});

// Защита от падений бота при кратковременных сетевых сбоях хостера
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ [Keep-Alive Guard] Необработанная ошибка Promise:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️ [Keep-Alive Guard] Системная ошибка:', err ? (err.message || err) : 'Unknown');
});

// 3. Инициализация Discord Клиента
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel, Partials.Message]
});

const packOnline=require('./pack-online.cjs').start(db,client);
const packReports=require('./pack-reports.cjs').start(db,client);
client.on('error', (err) => {
  console.error('⚠️ [Discord Gateway Error]:', err ? (err.message || err) : 'Unknown');
});

// Время запуска бота — сообщения из базы с более ранним временем не пересылаются повторно в Discord
const botStartTime = Date.now();

// Маппинг веток тикетов (Thread ID -> Ticket ID)
const threadToTicketMap = new Map();
const ticketToThreadMap = new Map();

// Переменные системы поддержания активности (Keep-Alive)
let heartbeatCount = 0;
let activityIndex = 0;

function formatUptime(seconds) {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}ч ${m}м ${sec}с`;
  if (m > 0) return `${m}м ${sec}с`;
  return `${sec}с`;
}

/**
 * Система удержания активности каждые 10 секунд (Keep-Alive Heartbeat)
 * Решает проблему засыпания/остановки бота на бесплатных/облачных хостингах:
 * 1. Меняет Discord Presence каждые 10 сек (активность на шлюзе Discord).
 * 2. Выполняет локальный HTTP self-ping (активность цикла событий Node.js и I/O сокетов).
 * 3. Выполняет внешний ping, если задан SELF_PING_URL / RENDER_EXTERNAL_URL / HOST_URL.
 * 4. Генерирует активность в консоли и проверяет пинг Firebase.
 */
function startKeepAliveSystem() {
  const INTERVAL_MS = 10000; // Ровно 10 секунд

  console.log('✦ [Keep-Alive] Монитор активности каждые 10 секунд успешно активирован.');

  // Список сменяемых статусов активности бота
  const statusList = [
    () => ({ name: '✦ Чат Astral RPG', type: ActivityType.Watching }),
    () => ({ name: `💬 Сайт ⇄ Discord (${(client && client.ws && client.ws.ping >= 0) ? client.ws.ping : 0}ms)`, type: ActivityType.Listening }),
    () => ({ name: '⚔️ Astral RPG Online', type: ActivityType.Playing }),
    () => ({ name: `⏱ Аптайм: ${formatUptime(process.uptime())}`, type: ActivityType.Watching }),
    () => ({ name: '🛡️ Поддержка & Тикеты', type: ActivityType.Listening })
  ];

  setInterval(() => {
    heartbeatCount++;
    const ping = (client && client.ws && client.ws.ping >= 0) ? client.ws.ping : -1;
    const uptimeStr = formatUptime(process.uptime());

    // 1. Активность Discord: динамическая ротация статуса каждые 10 секунд
    let currentStatusText = 'Online';
    if (client && client.user) {
      try {
        const item = statusList[activityIndex % statusList.length]();
        currentStatusText = item.name;
        client.user.setPresence({
          activities: [item],
          status: 'online'
        });
        activityIndex++;
      } catch (e) {}
    }

    // 2. Внутренний HTTP Self-Ping (поддержание сетевого ввода-вывода и цикла событий)
    try {
      const selfReq = http.get(`http://127.0.0.1:${PORT}/health`, (res) => {
        res.resume();
      });
      selfReq.on('error', () => {});
      selfReq.setTimeout(4000, () => selfReq.destroy());
    } catch (e) {}

    // 3. Внешний Self-Ping (если указан публичный URL хостинга, например на Render или Glitch)
    const externalUrl = process.env.SELF_PING_URL || process.env.RENDER_EXTERNAL_URL || process.env.HOST_URL;
    if (externalUrl) {
      try {
        const targetUrl = externalUrl.endsWith('/health') ? externalUrl : `${externalUrl.replace(/\/$/, '')}/health`;
        const httpModule = targetUrl.startsWith('https') ? https : http;
        const extReq = httpModule.get(targetUrl, (res) => {
          res.resume();
        });
        extReq.on('error', () => {});
        extReq.setTimeout(5000, () => extReq.destroy());
      } catch (e) {}
    }

    // 4. Активность в логах консоли (хостер фиксирует активный процесс)
    if (heartbeatCount % 6 === 0) {
      // Каждую минуту (каждые 60 сек) подробная статистика памяти и коннекта
      const memMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
      console.log(`✦ [Heartbeat] Пульс #${heartbeatCount} (10s) | Аптайм: ${uptimeStr} | Discord Ping: ${ping}ms | ОЗУ: ${memMb}MB | Статус: "${currentStatusText}"`);
    } else {
      // Каждые 10 секунд короткая отметка активности
      console.log(`[Keep-Alive 10s] Пульс #${heartbeatCount} | Ping: ${ping}ms | Активность: "${currentStatusText}"`);
    }

    // 5. Firebase Realtime Database ping (поддержание постоянного сокета)
    if (db && heartbeatCount % 3 === 0) {
      try {
        db.ref('.info/connected').once('value').catch(() => {});
      } catch (e) {}
    }
  }, INTERVAL_MS);
}

client.once('ready', async () => {
  console.log(`=======================================================`);
  console.log(`✦ [Discord] Бот успешно авторизован: ${client.user.tag}`);
  console.log(`✦ [Discord] Канал чата: ${DISCORD_CHANNEL_ID}`);
  console.log(`✦ [Discord] Канал тикетов: ${DISCORD_TICKETS_CHANNEL_ID}`);
  console.log(`✦ [Discord] Канал достижений MinePass: ${DISCORD_MINEPASS_CHANNEL_ID || 'не настроен'}`);
  console.log(`=======================================================`);

  // Установка стартовой активности
  try {
    client.user.setPresence({
      activities: [{ name: '✦ Чат Astral RPG', type: ActivityType.Watching }],
      status: 'online'
    });
  } catch (e) {}

  // Запуск слушателей Firebase при готовности бота
  if (db) {
    startFirebaseListeners();
  }
});

/**
 * Слушатели базы данных Firebase для передачи событий с сайта в Discord
 */
function startFirebaseListeners() {
  // -------------------------------------------------------------
  // А. САЙТ -> DISCORD (ОБЩИЙ ЧАТ)
  // -------------------------------------------------------------
  const chatRef = db.ref('chat');

  // MinePass -> Discord. Серверный мост пишет только подтверждённые события
  // в minepass/announcements; бот не принимает прогресс от клиента Minecraft.
  if (DISCORD_MINEPASS_CHANNEL_ID) {
    const achievementsRef = db.ref('minepass/announcements');
    achievementsRef.on('child_added', async (snapshot) => {
      try {
        const event = snapshot.val();
        if (!event || event.discordManagedExternally || !event.ts || Number(event.ts) < botStartTime - 5000) return;
        const channel = await client.channels.fetch(DISCORD_MINEPASS_CHANNEL_ID).catch(() => null);
        if (!channel || !channel.isTextBased()) {
          console.warn('[MinePass] Канал достижений не найден или недоступен.');
          return;
        }
        const clean = (value, fallback, limit = 180) => String(value ?? fallback)
          .replace(/@everyone|@here/g, (mention) => '@\u200b' + mention.slice(1))
          .replace(/[*_~`]/g, '')
          .slice(0, limit);
        const player = clean(event.player || event.nickname, 'Игрок');
        const title = clean(event.title, 'Новое достижение');
        const details = clean(event.description, 'Достижение MinePass выполнено');
        const reward = event.points || event.key ? `Награда: ${event.points || 0} очков${event.key ? ` и ${clean(event.key, 'ключ', 40)} ключ` : ''}` : '';
        await channel.send({
          embeds: [{
            color: 0x9bf26d,
            title: `✦ ${title}`,
            description: `**${player}** — ${details}${reward ? `\n\n${reward}` : ''}`,
            footer: { text: 'RikiMarci • MinePass' },
            timestamp: new Date(Number(event.ts)).toISOString()
          }],
          allowedMentions: { parse: [] }
        });
      } catch (err) {
        console.error('[MinePass] Ошибка публикации достижения:', err.message);
      }
    });
  }
  
  chatRef.on('child_added', async (snapshot) => {
    try {
      const msg = snapshot.val();
      if (!msg || !msg.text) return;

      // Защита от цикла: если сообщение пришло из Discord, не отправляем его обратно в Discord
      if (msg.fromDiscord) return;

      // Не отправляем в Discord сообщения, созданные до старта бота (чтобы не заспамить канал историей)
      const msgTime = Number(msg.ts) || 0;
      if (msgTime < botStartTime - 5000) return;

      const chatChannel = await client.channels.fetch(DISCORD_CHANNEL_ID).catch(() => null);
      if (!chatChannel || !chatChannel.isTextBased()) {
        console.warn('[Discord Warning] Канал чата не найден или недоступен.');
        return;
      }

      const isAdm = Boolean(msg.isAdmin);
      const isMod = !isAdm && Boolean(msg.isModerator);
      const prefix = isAdm ? '👑 **[Сайт/Админ]**' : (isMod ? '🛡️ **[Сайт/Модератор]**' : '💬 **[Сайт]**');
      const author = (msg.author || 'Странник').replace(/[*_~`]/g, '');
      const safeText = String(msg.text)
        .replace(/@everyone/g, '@\u200beveryone')
        .replace(/@here/g, '@\u200bhere');

      let replyQuoteStr = '';
      if (msg.replyTo && msg.replyTo.author) {
        const replyAuthor = String(msg.replyTo.author).replace(/[*_~`]/g, '');
        const replySnippet = String(msg.replyTo.text || '').slice(0, 50).replace(/[*_~`\n]/g, ' ');
        replyQuoteStr = `↳ *В ответ @${replyAuthor}: "${replySnippet}..."*\n`;
      }

      console.log(`[Сайт -> Discord] ${author}: ${safeText}`);
      await chatChannel.send({
        content: `${replyQuoteStr}${prefix} **${author}**: ${safeText}`
      });
    } catch (err) {
      console.error('[Chat Bridge Error] Ошибка пересылки сообщения сайта в Discord:', err.message);
    }
  });

  // -------------------------------------------------------------
  // Б. САЙТ -> DISCORD (ТИКЕТЫ И ОБРАЩЕНИЯ FAQ)
  // -------------------------------------------------------------
  const ticketsRef = db.ref('tickets');

  ticketsRef.on('child_added', async (snapshot) => {
    try {
      const ticket = snapshot.val();
      const ticketId = snapshot.key;
      if (!ticket || !ticket.text) return;

      // Не отправляем тикеты из старой истории
      const ticketTime = Number(ticket.createdAt) || 0;
      if (ticketTime < botStartTime - 10000) return;

      const ticketsChannel = await client.channels.fetch(DISCORD_TICKETS_CHANNEL_ID).catch(() => null);
      if (!ticketsChannel || !ticketsChannel.isTextBased()) {
        console.warn('[Discord Warning] Канал для тикетов не найден или недоступен.');
        return;
      }

      console.log(`[Сайт -> Discord] Новый тикет #${ticketId}: "${ticket.title}" от ${ticket.author}`);

      const embed = new EmbedBuilder()
        .setTitle(`📨 Новый вопрос / тикет #${ticketId.slice(-6)}`)
        .setDescription(`**${ticket.title || 'Без темы'}**\n\n${ticket.text}`)
        .setColor(0xC084FC) // Фирменный астральный сиреневый цвет
        .addFields(
          { name: '👤 Автор', value: `${ticket.author || 'Странник'} (${ticket.authorRole === 'admin' ? 'Администратор' : 'Странник'})`, inline: true },
          { name: '📊 Статус', value: '⏳ Ожидает ответа', inline: true },
          { name: '🔑 ID тикета', value: `\`${ticketId}\``, inline: true }
        )
        .setFooter({ text: `Ответьте в ветке этого сообщения или командой: !reply ${ticketId} <текст>` })
        .setTimestamp(ticket.createdAt ? new Date(ticket.createdAt) : new Date());

      const sentMsg = await ticketsChannel.send({ embeds: [embed] });

      // Создаем персональную ветку (Thread) для тикета
      if (sentMsg.startThread) {
        try {
          const thread = await sentMsg.startThread({
            name: `Тикет #${ticketId.slice(-6)}: ${(ticket.title || ticket.author || 'Вопрос').slice(0, 35)}`,
            autoArchiveDuration: 1440 // 24 часа
          });

          threadToTicketMap.set(thread.id, ticketId);
          ticketToThreadMap.set(ticketId, thread.id);

          // Сохраняем ID ветки и сообщения в Firebase для синхронизации даже после перезапуска бота
          await db.ref(`tickets/${ticketId}`).update({
            discordThreadId: thread.id,
            discordMessageId: sentMsg.id
          }).catch(() => {});

          await thread.send(
            `👋 Ветка для ответа на тикет **#${ticketId.slice(-6)}** создана.\n` +
            `Напишите здесь ваше сообщение — бот автоматически перешлет его пользователю **${ticket.author || 'Странник'}** на сайт как официальный ответ администрации!\n` +
            `Команда закрытия тикета: \`!close ${ticketId}\``
          );
        } catch (threadErr) {
          console.warn('[Tickets] Не удалось создать ветку тикета:', threadErr.message);
        }
      }
    } catch (err) {
      console.error('[Ticket Bridge Error] Ошибка пересылки тикета в Discord:', err.message);
    }
  });

  // -------------------------------------------------------------
  // В. УДАЛЕНИЕ ТИКЕТА НА САЙТЕ -> ЗАКРЫТИЕ И БЛОКИРОВКА ВЕТКИ В DISCORD
  // -------------------------------------------------------------
  ticketsRef.on('child_removed', async (snapshot) => {
    try {
      const ticketId = snapshot.key;
      const ticket = snapshot.val();
      console.log(`✦ [Сайт -> Discord] Тикет #${ticketId} удалён администратором на сайте.`);

      let threadId = ticket?.discordThreadId || ticketToThreadMap.get(ticketId);

      // Если ID ветки нет в памяти, пробуем найти среди активных веток канала
      if (!threadId) {
        try {
          const ticketsChannel = await client.channels.fetch(DISCORD_TICKETS_CHANNEL_ID).catch(() => null);
          if (ticketsChannel && ticketsChannel.threads) {
            const activeThreads = await ticketsChannel.threads.fetchActive().catch(() => null);
            if (activeThreads && activeThreads.threads) {
              const found = activeThreads.threads.find(t => 
                t.name.includes(ticketId.slice(-6)) || threadToTicketMap.get(t.id) === ticketId
              );
              if (found) threadId = found.id;
            }
          }
        } catch (e) {}
      }

      if (threadId) {
        const thread = await client.channels.fetch(threadId).catch(() => null);
        if (thread && thread.isThread()) {
          const embed = new EmbedBuilder()
            .setTitle('🗑️ Тикет удалён администратором')
            .setDescription(`Тикет \`#${ticketId.slice(-6)}\` (\`${ticketId}\`) был удалён на сайте Astral RPG.\nВетка заблокирована для новых сообщений и перенесена в архив.`)
            .setColor(0xEF4444)
            .setTimestamp();

          await thread.send({ embeds: [embed] }).catch(() => {});
          await thread.setLocked(true, 'Тикет удален на сайте').catch(() => {});
          await thread.setArchived(true, 'Тикет удален на сайте').catch(() => {});
          console.log(`✦ [Discord] Ветка "${thread.name}" заблокирована и отправлена в архив.`);
        }
        threadToTicketMap.delete(threadId);
      }
      ticketToThreadMap.delete(ticketId);
    } catch (err) {
      console.error('[Ticket Child Removed Error]', err.message);
    }
  });

  // -------------------------------------------------------------
  // Г. ИЗМЕНЕНИЕ СТАТУСА ТИКЕТА НА САЙТЕ (ЗАКРЫТИЕ / ОТКРЫТИЕ)
  // -------------------------------------------------------------
  ticketsRef.on('child_changed', async (snapshot) => {
    try {
      const ticketId = snapshot.key;
      const ticket = snapshot.val();
      if (!ticket) return;

      const threadId = ticket.discordThreadId || ticketToThreadMap.get(ticketId);
      if (threadId) {
        const thread = await client.channels.fetch(threadId).catch(() => null);
        if (thread && thread.isThread()) {
          if (ticket.status === 'closed' && !thread.archived) {
            await thread.send('🔒 **Тикет закрыт администратором на сайте.**\nВетка перемещена в архив. Чтобы возобновить диалог, тикет можно открыть снова на сайте.').catch(() => {});
            await thread.setArchived(true).catch(() => {});
          } else if (ticket.status === 'open' && thread.archived) {
            await thread.setArchived(false).catch(() => {});
            await thread.send('⏳ **Тикет открыт снова на сайте.**').catch(() => {});
          }
        }
      }
    } catch (err) {
      console.error('[Ticket Child Changed Error]', err.message);
    }
  });
}

/**
 * Проверка прав администратора у участника сервера Discord
 */
function isUserAdmin(member) {
  if (!member) return false;
  if (member.permissions.has('Administrator')) return true;
  if (member.permissions.has('ManageGuild')) return true;
  if (member.permissions.has('ModerateMembers')) return true;
  return member.roles.cache.some(r => /admin|администратор|модератор|смотритель/i.test(r.name));
}

/**
 * Отправка ответа на тикет в Firebase
 */
async function sendTicketReply(ticketId, replyAuthor, replyText, isAdm, discordMessage = null) {
  if (!db) {
    if (discordMessage) await discordMessage.reply('⚠️ База данных Firebase не подключена.');
    return;
  }

  try {
    // 1. Проверяем, существует ли тикет в базе перед добавлением ответа!
    const ticketSnap = await db.ref(`tickets/${ticketId}`).once('value');
    if (!ticketSnap.exists() || !ticketSnap.val()) {
      console.warn(`[Ticket Reply] Тикет ${ticketId} не найден или был удалён на сайте.`);
      if (discordMessage) {
        const embed = new EmbedBuilder()
          .setTitle('❌ Тикет удалён или не существует')
          .setDescription(`Тикет \`${ticketId}\` больше не существует на сайте Astral RPG (был удалён администратором).\nОтвет не может быть сохранён. Ветка закрывается и отправляется в архив.`)
          .setColor(0xEF4444);

        await discordMessage.reply({ embeds: [embed] }).catch(() => {});

        if (discordMessage.channel.isThread()) {
          await discordMessage.channel.setLocked(true, 'Тикет удален на сайте').catch(() => {});
          await discordMessage.channel.setArchived(true, 'Тикет удален на сайте').catch(() => {});
        }
      }
      return;
    }

    const ticketData = ticketSnap.val();
    if (ticketData.status === 'closed') {
      if (discordMessage) {
        await discordMessage.reply('ℹ️ Этот тикет уже закрыт. Чтобы задать вопрос, создайте новый тикет на сайте или откройте тикет снова.');
      }
      return;
    }

    // 2. Добавляем ответ в ветку replies тикета
    await db.ref(`tickets/${ticketId}/replies`).push({
      author: replyAuthor,
      text: replyText,
      createdAt: Date.now(),
      isAdmin: isAdm,
      fromDiscord: true
    });

    // 3. Обновляем статус тикета на "answered" (Ответ получен)
    await db.ref(`tickets/${ticketId}`).update({
      status: 'answered',
      updatedAt: Date.now()
    });

    console.log(`[Discord -> Тикеты] Ответ на тикет ${ticketId} от ${replyAuthor}: "${replyText}"`);

    if (discordMessage) {
      await discordMessage.react('✅').catch(() => {});
      await discordMessage.channel.send(
        `👑 **Официальный ответ отправлен на сайт!**\n` +
        `Тикет: \`${ticketId}\`\n` +
        `Статус обновлён на: **✅ Ответ получен**.`
      );
    }
  } catch (err) {
    console.error('[Firebase Ticket Error] Ошибка записи ответа:', err);
    if (discordMessage) {
      await discordMessage.reply(`⚠️ Ошибка сохранения ответа в базе: ${err.message}`);
    }
  }
}

/**
 * Обработка сообщений из Discord
 */
client.on('messageCreate', async (message) => {
  // Игнорировать сообщения от ботов и пустые сообщения
  if (message.author.bot) return;

  const text = message.content.trim();
  if (!text) return;

  const authorName = message.member?.displayName || message.author.username;
  const isAdm = isUserAdmin(message.member);

  // -------------------------------------------------------------
  // СЛУЧАЙ 1: Сообщение внутри ветки (Thread) тикета
  // -------------------------------------------------------------
  let ticketId = null;
  if (message.channel.isThread()) {
    if (threadToTicketMap.has(message.channel.id)) {
      ticketId = threadToTicketMap.get(message.channel.id);
    } else if (message.channel.parentId === DISCORD_TICKETS_CHANNEL_ID) {
      // Восстанавливаем ID тикета из начального сообщения бота (embed) или названия ветки
      try {
        const starter = await message.channel.fetchStarterMessage().catch(() => null);
        if (starter && starter.embeds && starter.embeds.length > 0) {
          const idField = starter.embeds[0].fields?.find(f => f.name && f.name.includes('ID тикета'));
          if (idField) {
            const m = idField.value.match(/`?([^`\s]+)`?/);
            if (m) ticketId = m[1];
          }
        }
      } catch (e) {}

      if (!ticketId && db) {
        const m = message.channel.name.match(/#([a-zA-Z0-9_-]+)/);
        if (m) {
          const partialId = m[1];
          const snap = await db.ref('tickets').once('value').catch(() => null);
          if (snap && snap.exists()) {
            const allObj = snap.val();
            const fullKey = Object.keys(allObj).find(k => k.endsWith(partialId) || k === partialId);
            if (fullKey) ticketId = fullKey;
          }
        }
      }

      if (ticketId) {
        threadToTicketMap.set(message.channel.id, ticketId);
        ticketToThreadMap.set(ticketId, message.channel.id);
      }
    }
  }

  if (ticketId) {
    // Команда закрытия из ветки
    if (text.startsWith('!close')) {
      if (db) {
        const ticketSnap = await db.ref(`tickets/${ticketId}`).once('value');
        if (!ticketSnap.exists()) {
          await message.reply('❌ Этот тикет уже был удалён на сайте.');
          await message.channel.setLocked(true, 'Тикет удален').catch(() => {});
          await message.channel.setArchived(true, 'Тикет удален').catch(() => {});
          return;
        }

        await db.ref(`tickets/${ticketId}`).update({ status: 'closed', updatedAt: Date.now() });
        await message.react('🔒');
        await message.channel.send(`🔒 Тикет \`${ticketId}\` закрыт.`);
        await message.channel.setArchived(true, 'Тикет закрыт').catch(() => {});
      }
      return;
    }

    // Обычное сообщение в ветке считается ответом на тикет
    await sendTicketReply(ticketId, authorName, text, isAdm, message);
    return;
  }

  // -------------------------------------------------------------
  // СЛУЧАЙ 2: Команды управления тикетами (!reply, !close, !help)
  // -------------------------------------------------------------
  if (text.startsWith('!reply')) {
    const parts = text.slice(6).trim().split(/\s+/);
    const targetTicketId = parts[0];
    const replyBody = parts.slice(1).join(' ');

    if (!targetTicketId || !replyBody) {
      await message.reply('ℹ️ Формат команды: `!reply <ID_тикета> <ваш_ответ>`\nПример: `!reply -Nxyz123 Спасибо за обращение, исправили!`');
      return;
    }

    await sendTicketReply(targetTicketId, authorName, replyBody, isAdm, message);
    return;
  }

  if (text.startsWith('!close')) {
    const targetTicketId = text.slice(6).trim();
    if (!targetTicketId) {
      await message.reply('ℹ️ Формат команды: `!close <ID_тикета>`');
      return;
    }
    if (db) {
      const ticketSnap = await db.ref(`tickets/${targetTicketId}`).once('value');
      if (!ticketSnap.exists()) {
        await message.reply(`❌ Тикет \`${targetTicketId}\` не найден или уже был удалён на сайте.`);
        return;
      }
      await db.ref(`tickets/${targetTicketId}`).update({ status: 'closed', updatedAt: Date.now() });
      await message.react('🔒');
      await message.reply(`🔒 Тикет \`${targetTicketId}\` успешно помечен как закрытый.`);

      const thId = ticketSnap.val()?.discordThreadId || ticketToThreadMap.get(targetTicketId);
      if (thId) {
        const th = await client.channels.fetch(thId).catch(() => null);
        if (th && th.isThread()) {
          await th.send(`🔒 Тикет закрыт командой из Discord.`);
          await th.setArchived(true, 'Тикет закрыт').catch(() => {});
        }
      }
    }
    return;
  }

  // -------------------------------------------------------------
  // СЛУЧАЙ 2.5: Команда связки аккаунта (!link <код>)
  // -------------------------------------------------------------
  if (text.startsWith('!link')) {
    const code = text.slice(5).trim().toUpperCase();
    if (!code) {
      await message.reply('ℹ️ Укажите код привязки: `!link AST-XXXX`\nПолучить код можно в окне профиля на сайте Astral.');
      return;
    }

    if (!db) {
      await message.reply('⚠️ База данных временно недоступна. Попробуйте позже.');
      return;
    }

    try {
      const linkRef = db.ref(`discord_links/${code}`);
      const linkSnap = await linkRef.once('value');
      const linkData = linkSnap.val();

      if (!linkSnap.exists() || !linkData) {
        await message.reply('❌ Код привязки не найден или срок его действия истёк.\nСгенерируйте свежий код в профиле на сайте.');
        return;
      }

      if (linkData.status === 'linked') {
        await message.reply('⚠️ Этот код уже был использован.');
        return;
      }

      const avatarUrl = message.author.displayAvatarURL({ extension: 'png', size: 128 });
      const discordId = message.author.id;
      const cleanName = (message.member?.displayName || message.author.username).trim();

      // Сохраняем успешную привязку в базу
      await linkRef.update({
        status: 'linked',
        discordName: cleanName,
        discordTag: message.author.tag || message.author.username,
        discordId: discordId,
        discordAvatar: avatarUrl,
        isAdmin: isAdm,
        linkedAt: Date.now()
      });

      // Если в Discord участник админ/модератор — автоматически выдаём админку на сайте!
      if (isAdm) {
        const safeKey = encodeURIComponent(cleanName.toLowerCase())
          .replace(/\./g, '%2E').replace(/\$/g, '%24').replace(/#/g, '%23').replace(/\[/g, '%5B');
        if (safeKey) {
          await db.ref(`admins/${safeKey}`).set({
            role: 'admin',
            assignedAt: Date.now(),
            assignedBy: 'discord_auto_link'
          });
        }
      }

      await message.react('🎉').catch(() => {});
      const embed = new EmbedBuilder()
        .setTitle('✅ Discord успешно привязан!')
        .setDescription(`Аккаунт **${cleanName}** связан с профилем на сайте Astral.`)
        .setThumbnail(avatarUrl)
        .setColor(0x4ADE80)
        .addFields(
          { name: '👤 Позывной на сайте', value: `\`${cleanName}\``, inline: true },
          { name: '👑 Статус администратора', value: isAdm ? 'Да (активен)' : 'Обычный странник', inline: true }
        )
        .setFooter({ text: 'Профиль на сайте уже обновился!' });

      await message.reply({ embeds: [embed] });
      console.log(`[Discord Link] Код ${code} привязан к ${cleanName} (ID: ${discordId}, Admin: ${isAdm})`);
    } catch (err) {
      console.error('[Discord Link Error]', err);
      await message.reply(`⚠️ Ошибка привязки: ${err.message}`);
    }
    return;
  }


  if (text === '!bridge' || text === '!status') {
    const embed = new EmbedBuilder()
      .setTitle('✦ Статус моста Astral <-> Discord')
      .setColor(0x38BDF8)
      .addFields(
        { name: '🤖 Бот Discord', value: `🟢 Онлайн (${client.user.tag})`, inline: true },
        { name: '🔥 База Firebase', value: db ? '🟢 Подключено' : '🔴 Ошибка / Нет ключа', inline: true },
        { name: '💬 Канал чата', value: `<#${DISCORD_CHANNEL_ID}>`, inline: true },
        { name: '📨 Канал тикетов', value: `<#${DISCORD_TICKETS_CHANNEL_ID}>`, inline: true },
        { name: '⏱ Время работы', value: `${Math.round(process.uptime())} сек`, inline: true },
        { name: '💓 Пульс (10s)', value: `#${heartbeatCount} (${(client && client.ws) ? client.ws.ping : 0}ms)`, inline: true }
      )
      .setFooter({ text: 'Astral RPG Station OS Bridge' });

    await message.reply({ embeds: [embed] });
    return;
  }

  // -------------------------------------------------------------
  // СЛУЧАЙ 3: Обычное сообщение в канале общего чата -> отправка на сайт
  // -------------------------------------------------------------
  if (message.channel.id === DISCORD_CHANNEL_ID) {
    console.log(`[Discord -> Сайт] ${authorName}: ${text}`);

    if (db) {
      try {
        let replyTo = null;
        if (message.reference && message.reference.messageId) {
          try {
            const refMsg = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
            if (refMsg) {
              const refAuthor = refMsg.member?.displayName || refMsg.author.username;
              const refText = (refMsg.cleanContent || refMsg.content || '').slice(0, 80);
              replyTo = { id: refMsg.id, author: refAuthor, text: refText };
            }
          } catch(e) {}
        }

        const pushPayload = {
          author: authorName,
          text: text,
          ts: Date.now(),
          fromDiscord: true,
          isAdmin: isAdm,
          avatar: message.author.displayAvatarURL({ extension: 'png', size: 64 })
        };
        if (replyTo) {
          pushPayload.replyTo = replyTo;
        }

        await db.ref('chat').push(pushPayload);
        await message.react('✨').catch(() => {});
      } catch (err) {
        console.error('[Firebase Error] Не удалось отправить сообщение из Discord в базу:', err);
      }
    }
  }
});

// 4. Запуск бота
if (DISCORD_BOT_TOKEN && DISCORD_BOT_TOKEN !== 'ВСТАВЬТЕ_ТОКЕН_БОТА_DISCORD') {
  client.login(DISCORD_BOT_TOKEN).catch(err => {
    console.error('❌ [Discord Error] Ошибка входа бота:', err.message);
    console.error('   Проверьте правильность токена DISCORD_BOT_TOKEN в файле или переменных окружения.');
  });
} else {
  console.warn('⚠️ [Discord] Токен бота не задан. Укажите DISCORD_BOT_TOKEN в файле или переменной окружения.');
}
