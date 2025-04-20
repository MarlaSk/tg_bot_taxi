require('dotenv').config();
const { Bot, Keyboard } = require('grammy');
const Database = require('better-sqlite3');
const fs = require('fs');

// Загрузка данных из JSON
const dbData = JSON.parse(fs.readFileSync('taxi.json', 'utf8'));

// Инициализация базы данных
const db = new Database('taxi_fixed_prices.db');

// Создаем таблицы
db.exec(`
  CREATE TABLE IF NOT EXISTS districts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    keywords TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS fixed_prices (
    from_district TEXT NOT NULL,
    to_district TEXT NOT NULL,
    price INTEGER NOT NULL,
    PRIMARY KEY (from_district, to_district)
  );
`);

// Заполняем данные из JSON
function initDatabase() {
  // Очищаем старые данные
  db.exec(`DELETE FROM fixed_prices; DELETE FROM districts;`);

  // Добавляем районы
  const insertDistrict = db.prepare(`INSERT INTO districts (name, keywords) VALUES (?, ?)`);
  db.transaction(() => {
    dbData.districts.forEach(district => {
      insertDistrict.run(district.name, district.keywords);
    });
  })();

  // Добавляем фиксированные цены
  const insertPrice = db.prepare(`INSERT INTO fixed_prices (from_district, to_district, price) VALUES (?, ?, ?)`);
  db.transaction(() => {
    dbData.prices.forEach(price => {
      insertPrice.run(price.from, price.to, price.price);
    });
  })();
}

initDatabase();

// Создаем бота
const bot = new Bot(process.env.BOT_API_KEY);
const userSessions = new Map();

const mainKeyboard = new Keyboard()
.text("🚖 Рассчитать стоимость").row() // Первая строка с одной кнопкой
.text("ℹ️ Допы").text("📦 Доставка").text("🌍 Межгород") // Вторая строка с тремя кнопками
  .resized()
  .persistent(); // Это важно для отображения кнопок

// Сообщение с информацией о допнадбавках
const EXTRAS_INFO = `Дополнительные надбавки к тарифу:

⏱ <b>Ожидание</b>:
- 5 минут бесплатно (ночью 3)
- Далее 10₽/минута

🚙 <b>В гаражи/бездорожье</b>:
- +20₽ к тарифу

👥 <b>Дополнительные пассажиры</b>:
- 3-й пассажир: +20₽
- 4-й пассажир: +50₽
- 5+ пассажиров: двойной тариф

🛑 <b>Остановка</b>: +20₽
↪️ <b>Заезд</b>: +40₽
⚠️ <b>Неудобный заезд</b>: +60₽

🧳 <b>Багаж</b>: +30₽
🐕 <b>Животные без переноски</b>: +50₽
🗣️ <b>Крупногабаритный багаж</b>: индивидуально

⏳ <b>Почасовая аренда</b>: 1000₽
🔋 <b>Прикурить</b>: от 250₽
🌀 <b>Подкачка колес</b>: от 200₽`; // Ваше сообщение о допах

const DELIVERY_INFO = `📦 <b>Условия доставки</b>:

🏙️ <b>Город, микрорайон, Питер</b>:
- 300₽ + сумма чека

9️⃣ <b>Девятый район</b>:
- 350₽ + сумма чека

🚪 <b>До квартиры</b>:
- Дополнительно +50₽

🌙 <b>Ночное время (23:00-06:00)</b>:
- Дополнительно +100₽

🌳 <b>Другие направления</b> (сады, новый путь, додоново):
- Цена договорная + сумма чека`;

const INTERCITY_INFO = `🌍 <b>Межгородские тарифы</b>:

<b>Ближайшие направления:</b>
Подгорный = 700₽
➡️ Подгорный (снт "Рассвет") = 800₽
➡️ Сосновоборск = 700₽
➡️ Серебряный ключ = 800₽
➡️ Терентьево ~ 900₽
➡️ Бархатово Озеро #Есаулово ~1000₽
➡️ Ермолаево, Дружба ~1100₽
➡️ БархатПарк =1000₽
➡️ Киндяково =1100₽
➡️ Поселок Бархатово, Берёзовка =1200₽

🌍 <b>Общий тариф:</b> 35₽/км

🇺🇿 <b>Красноярск:</b> 🇺🇿
➡️ Глинки #Крастец = 1400₽
➡️ Ленинский =1400₽
➡️ Черемушки =1400₽
➡️ Кировский =1500₽
➡️ Солнечный = 1500₽
➡️ ЗелёнаяРоща (мет-гов, Воронова...) = 1500₽
➡️ Взлётка #Краевая #Автовокзал #ПЛАНЕТА #Советский = 1600₽
➡️ Северный = 1600₽
➡️ Покровка = 1700₽
➡️ Предмостная #Матросова = 1700₽
➡️ Свердловский(за предмостной до моста) = 1800₽
➡️ ЖДвокзал🚂 =1800₽
➡️ Центральный =1700₽
➡️ Железнодорожный = 1800₽
➡️ Октябрьский (Свободный, Копылова, #Академ, Солонцы) = 2000₽
➡️ СевероЗападный (БСМП, вильского, ботаническая) = 2000₽
➡️ Удачный = 2000₽
➡️ БобровыйЛог = 2000₽
➡️ Роев Ручей = 2200₽
➡️ Аэропорт✈️ = 2500₽
➡️ Поселок Береть = 3900₽`;

// Обработчик команды /start (обновленный)
bot.command('start', async (ctx) => {
  await ctx.reply("Добро пожаловать! Выберите действие:", {
    reply_markup: mainKeyboard,
    parse_mode: "HTML"
  });
});

// Обработчик кнопки "Допы"
bot.hears("ℹ️ Допы", async (ctx) => {
  await ctx.reply(EXTRAS_INFO, {
    parse_mode: "HTML",
    reply_markup: mainKeyboard
  });
});

// Обработчик кнопки "Доставка"
bot.hears("📦 Доставка", async (ctx) => {
  await ctx.reply(DELIVERY_INFO, {
    parse_mode: "HTML",
    reply_markup: mainKeyboard
  });
});

// Обработчик кнопки "Межгород"
bot.hears("🌍 Межгород", async (ctx) => {
  await ctx.reply(INTERCITY_INFO, {
    parse_mode: "HTML",
    reply_markup: mainKeyboard
  });
});

// Обработчик кнопки "Рассчитать стоимость"
bot.hears("🚖 Рассчитать стоимость", async (ctx) => {
  userSessions.set(ctx.from.id, { step: 'waiting_from' });
  await ctx.reply(`🚖 Введите начальный адрес (например: "Ленина 15" или "Микрорайон"):\n
(Желательно не использовать номера дома в конце улиц)`, {
    reply_markup: { remove_keyboard: true } // Убираем клавиатуру при вводе адреса
  });
});
// Функция для нормализации адреса
function normalizeAddress(address) {
  return address
    .replace(/\d+\s*[а-яa-z]?(\s*\/\s*\d+[а-яa-z]?)?/gi, '')
    .replace(/[,\.]/g, '')
    .trim()
    .toLowerCase();
}

// Функция поиска района по адресу
function findDistrict(address) {
  // Сначала проверяем полный адрес
  const exactMatch = db.prepare(`
    SELECT name FROM districts 
    WHERE keywords LIKE '%' || ? || '%'
    LIMIT 1
  `).get(address.toLowerCase());

  if (exactMatch) return exactMatch;

  // Затем проверяем нормализованный адрес (без номера дома)
  const normalized = normalizeAddress(address);
  return db.prepare(`
    SELECT name FROM districts 
    WHERE keywords LIKE '%' || ? || '%'
    LIMIT 1
  `).get(normalized);
}

// Функция получения фиксированной цены
function getFixedPrice(fromDistrict, toDistrict) {
  // Проверяем прямое направление
  const directPrice = db.prepare(`
    SELECT price FROM fixed_prices 
    WHERE from_district = ? AND to_district = ?
  `).get(fromDistrict, toDistrict);

  if (directPrice) return directPrice.price;

  // Проверяем обратное направление
  const reversePrice = db.prepare(`
    SELECT price FROM fixed_prices 
    WHERE from_district = ? AND to_district = ?
  `).get(toDistrict, fromDistrict);

  return reversePrice?.price || null;
}

// Обработчики бота
bot.command('start', async (ctx) => {
  userSessions.set(ctx.from.id, { step: 'waiting_from' });
  await ctx.reply('🚖 Введите начальный адрес (например: "Ленина 15" или "Микрорайон"):');
});

bot.on('message:text', async (ctx) => {
  const userId = ctx.from.id;
  const session = userSessions.get(userId);
  const text = ctx.message.text.trim();

  if (!session) return ctx.reply('Пожалуйста, начните с команды /start');

  try {
    if (session.step === 'waiting_from') {
      const district = findDistrict(text);
      if (!district) {
        return ctx.reply('Не удалось определить район. Уточните адрес:');
      }

      userSessions.set(userId, {
        step: 'waiting_to',
        fromDistrict: district.name,
        originalFrom: text
      });

      await ctx.reply(`📍 Район отправления: ${district.name}\nТеперь введите конечный адрес:`);
    
    } else if (session.step === 'waiting_to') {
      const district = findDistrict(text);
      if (!district) {
        return ctx.reply('Не удалось определить район. Уточните адрес:');
      }

      const price = getFixedPrice(session.fromDistrict, district.name);
      if (!price) {
        return ctx.reply('Для данного маршрута не установлен тариф');
      }

      await ctx.reply(
        `✅ Расчет стоимости:\n\n` +
        `📍 Откуда: ${session.originalFrom} (${session.fromDistrict})\n` +
        `🏁 Куда: ${text} (${district.name})\n\n` +
        `💵 Стоимость: ${price} руб.\n\n` +
        `Для нового расчета нажмите "Рассчитать стоимость"`,
        {
          reply_markup: {
            keyboard: mainKeyboard.build(),
            resize_keyboard: true
          }
        }
      );

      userSessions.delete(userId);
    }
  } catch (error) {
    console.error('Ошибка:', error);
    await ctx.reply('Произошла ошибка. Начните заново: /start');
    userSessions.delete(userId);
  }
});

// Запуск бота
bot.start();
console.log('Бот запущен!');