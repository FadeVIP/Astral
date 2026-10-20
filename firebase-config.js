window.__FROSTBORNE_FIREBASE_CONFIG__ = {
  apiKey: 'AIzaSyCmI7epHT8ZnK-AlGzRPbLSy3b73bdt1-Y',
  authDomain: 'astral-524a1.firebaseapp.com',
  databaseURL: 'https://astral-524a1-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'astral-524a1',
  storageBucket: 'astral-524a1.firebasestorage.app',
  messagingSenderId: '623391524828',
  appId: '1:623391524828:web:e0a0aeb5fe49bdbde5f119',
  measurementId: 'G-NPTXEBS2N4',

  // D-04: uid владельца для модерации Эфира.
  // Как заполнить:
  //   1) Firebase Console -> Authentication -> Sign-in method -> включить Google
  //   2) Открыть Эфир, в профиле нажать «Вход для модератора», войти своим Google
  //   3) Узел покажет твой uid — вставить его сюда И в firebase-rules.json
  //      (заменить все __ADMIN_UID__), затем опубликовать правила заново
  // Пока пусто — кнопки удаления не появляются ни у кого.
  adminUid: 'tFWTHC3NX2PxzqlKKjwYTO3Xxv43',
  adminEmail: 'korolevikh2001vlad@gmail.com',

  // L-01: App Check — запросы к базе принимаются только с нашего сайта.
  // Как заполнить:
  //   1) Firebase Console -> App Check -> Apps -> веб-приложение -> reCAPTCHA v3
  //   2) Зарегистрировать, скопировать site key (публичный, его видно в коде)
  //   3) Вставить сюда и в консоли включить Enforce для Realtime Database
  // L-01: App Check
  appCheckKey: '',

  // Discord Webhook: пересылка сообщений из чата сайта в ваш канал Discord
  // Как настроить: Discord -> Настройки канала -> Интеграция -> Вебхуки -> Скопировать URL
  // Пример: 'https://discord.com/api/webhooks/123456789/abcdef...'
  discordWebhookUrl: ''
};
