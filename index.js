require("dotenv").config();
const { Bot, InlineKeyboard, Keyboard, session } = require("grammy");
const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const stripe = require("stripe")(process.env.STRIPE_KEY); // Добавьте эту строку
const fs = require("fs");
const axios = require("axios");
const connectDB = require("./database");
const Session = require("./sessionModel");

// Создаем экземпляр бота
const bot = new Bot(process.env.BOT_API_KEY); // Ваш API ключ от Telegram бота

// Подключаемся к MongoDB
connectDB();

// Функция для загрузки сообщений из JSON-файла
const loadMessages = () => {
  return JSON.parse(fs.readFileSync("messages.json", "utf8"));
};
const messages = loadMessages();

// Функция для генерации уникального ID в допустимом диапазоне
function generateUniqueId() {
  const maxId = 2147483647; // Максимально допустимое значение
  const minId = 1; // Минимально допустимое значение
  return (Date.now() % (maxId - minId + 1)) + minId;
}

// Функция для генерации ссылки на оплату
function generatePaymentLink(paymentId, sum, email) {
  const shopId = process.env.ROBO_ID; // Логин вашего магазина в Робокассе
  const secretKey1 = process.env.ROBO_SECRET1; // Secret Key 1 для формирования подписи

  const signature = crypto
    .createHash("md5")
    .update(`${shopId}:${sum}:${paymentId}:${secretKey1}`)
    .digest("hex");

  return `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${shopId}&OutSum=${sum}&InvId=${paymentId}&SignatureValue=${signature}&Email=${encodeURIComponent(
    email
  )}&IsTest=0`; // Используйте https://auth.robokassa.ru/ для продакшена
}

// Функция для создания объекта Price
async function createStripePrice() {
  const price = await stripe.prices.create({
    unit_amount: 1000, // 10 евро в центах
    currency: "amd",
    product_data: {
      name: "Webinar Registration",
    },
  });
  return price.id;
}

async function generatePaymentLinkForStudio(studio, email) {
  const studioInfo = studioDetails[studio];

  if (!studioInfo) {
    throw new Error("Студия не найдена");
  }

  const paymentId = generateUniqueId(); // Генерируем уникальный ID для платежа
  const sum = studioInfo.price;
  const currency = studioInfo.currency;
  const e = email;

  if (studioInfo.paymentSystem === "robokassa") {
    // Генерация ссылки для Robokassa
    const paymentLink = generatePaymentLink(paymentId, sum, e);
    return { paymentLink, paymentId };
  } else if (studioInfo.paymentSystem === "stripe") {
    // Генерация ссылки для Stripe
    const priceId = await createStripePrice(studioInfo.price, currency, studio);
    const paymentLink = await createStripePaymentLink(priceId, paymentId);
    return { paymentLink, paymentId };
  } else {
    throw new Error("Неизвестная платёжная система");
  }
}

// Функция для создания цены в Stripe
async function createStripePrice(amount, currency, productName) {
  const price = await stripe.prices.create({
    unit_amount: amount * 100, // Stripe принимает сумму в минимальных единицах (центах)
    currency: currency.toLowerCase(),
    product_data: {
      name: productName,
    },
  });
  return price.id;
}

// Функция для создания ссылки на оплату через Stripe
async function createStripePaymentLink(priceId, paymentId) {
  const paymentLink = await stripe.paymentLinks.create({
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    metadata: {
      paymentId: paymentId, // Передаем идентификатор заказа
    },
  });
  return paymentLink.url;
}

const studioDetails = {
  "Студия на м. 1905г.": {
    price: 1,
    currency: "RUB",
    tag: "01MSC_group_YCG_start",
    paymentSystem: "robokassa", // Использовать Robokassa для России
  },
  "Студия на м. Петроградская": {
    price: 2,
    currency: "RUB",
    tag: "01SPB_group_RTC_start",
    paymentSystem: "robokassa", // Использовать Robokassa для России
  },
  "Студия на 950. Выборгская": {
    price: 3,
    currency: "RUB",
    tag: "01SPB_group_HKC_start",
    paymentSystem: "robokassa",
  },
  "Студия на м. Московские Ворота": {
    price: 4,
    currency: "RUB",
    tag: "01SPB_group_SPI_start",
    paymentSystem: "robokassa",
  },
  "Студия на Бузанда": {
    price: 100,
    currency: "AMD",
    tag: "01YRV_group_GFT_start",
    paymentSystem: "stripe", // Использовать Stripe для Еревана
  },
};

// Функция для получения данных о ценах и расписании в зависимости от студии
function getPriceAndSchedule(studio) {
  const priceSchedule = {
    "Студия на м. 1905г.":
      "Адрес студии м. 1905г.: \nм. Ул. Большая Декабрьская, д.3 с25\n\n🔻 Расписание занятий:\nВторник 18:40 и 20:00\nЧетверг 18:40 и 20:00\nСуббота 12:00\n\n🔻 Стоимость тренировок:\n👉🏻Пробное занятие - 950₽\n👉🏻Абонемент на 12 тренировок (доступ 6 недель) - 11 400₽\n👉🏻1 тренировка (по-разово) - 1 100₽\n\n🔻 Цены индивидуальных тренировок:\n1 тренировка (1 чел.) - 3 600₽ за занятие\n1 тренировка (2 чел.) - 5 000₽ за занятие\n1 тренировка (3 чел.) - 6 000₽ за занятие",
    "Студия на м. Петроградская":
      "Адрес студии м. Петроградская.:\n  Ул. Газовая 10Н\n\n🔻 Расписание занятий:\nВторник 20:00\nЧетверг 20:00\nСуббота 14:00\n\n🔻 Стоимость тренировок:\n👉🏻 Пробное занятие - 950₽\n👉🏻 Абонемент на 12 тренировок (доступ 4 недели) - 9 600₽\n👉🏻 Абонемент на 12 тренировок (доступ 6 недели) - 11 400₽\n1 тренировка (по-разово) - 1 100₽\n\n🔻 Цены индивидуальных тренировок:\n1 тренировка (1 чел.) - 3 600₽ за занятие\n1 тренировка (2 чел.) - 5 000₽ за занятие\n1 тренировка (3 чел.) - 6 000₽ за занятие",
    "Студия на м. Выборгская":
      "Адрес студии м. Выборгская.:\n  Малый Сампсониевский пр., дом 2\n\n🔻 Расписание занятий:\nВторник 20:30\nЧетверг 20:30\nСуббота 14:00\n\n🔻 Стоимость тренировок:\n👉🏻 Пробное занятие - 950₽\n👉🏻 Абонемент на 12 тренировок (доступ 4 недели) - 9 600₽\n👉🏻 Абонемент на 12 тренировок (доступ 6 недель) - 11 400₽\n1 тренировка (по-разово) - 1 100₽\n\n🔻 Цены индивидуальных тренировок:\n1 тренировка (1 чел.) - 3 600₽ за занятие\n1 тренировка (2 чел.) - 5 000₽ за занятие\n1 тренировка (3 чел.) - 6 000₽ за занятие",
    "Студия на м. Московские Ворота":
      "Адрес студии м. Выборгская.:\n  Ул. Заставская, 33П\n\n🔻 Расписание занятий:\nВторник 20:40\nЧетверг 20:40\nСуббота 14:00\n\n🔻 Стоимость тренировок:\n👉🏻 Пробное занятие - 950₽\n👉🏻 Абонемент на 12 тренировок (доступ 4 недели) - 9 600₽\n👉🏻 Абонемент на 12 тренировок (доступ 6 недель) - 11 400₽\n1 тренировка (по-разово) - 1 100₽\n\n🔻 Цены индивидуальных тренировок:\n1 тренировка (1 чел.) - 3 600₽ за занятие\n1 тренировка (2 чел.) - 5 000₽ за занятие\n1 тренировка (3 чел.) - 6 000₽ за занятие",
    "Студия на Бузанда":
      "Адрес студии на ул. Бузанда.:\n Ул. Павстоса Бузанда, 1/3\n\n🔻 Расписание занятий:\nПонедельник 08:30 (утро) \nСреда 08:30 (утро) \nПятница 08:30 (утро) \n\n🔻 Стоимость тренировок:\n👉🏻 Пробное занятие - 5000 AMD\n👉🏻 Абонемент на 12 тренировок (доступ 6 недель) - 60 000 AMD\n1 тренировка (по-разово) - 7 000 AMD\n\n🔻 Цены индивидуальных тренировок:\n1 тренировка (1 чел.) - 12 500 AMD за занятие\n1 тренировка (2 чел.) - 17 000 AMD за занятие\n1 тренировка (3 чел.) - 21 000 AMD за занятие",
  };

  return (
    priceSchedule[studio] || "Цена и расписание зависят от выбранной программы."
  );
}

// Функция для отправки данных на вебхук
async function sendToWebhook(studio, telegramId) {
  const webhookUrl =
    "https://hook.eu1.make.com/dg644dcxuiuxrj57lugpl4dkuwv4pyvw"; // Вставьте ваш URL вебхука

  // Формируем данные для отправки
  const data = [
    {
      messenger: "telegram",
      variables: [
        {
          name: "studio",
          type: "text",
          value: studio, // Передаем выбранную студию
        },
      ],
      telegram_id: telegramId, // Передаем id пользователя
    },
  ];

  try {
    // Отправляем POST-запрос на вебхук Make.com
    await axios.post(webhookUrl, data);
    console.log("Данные успешно отправлены на вебхук");
  } catch (error) {
    console.error("Ошибка при отправке на вебхук:", error.message);
  }
}

// Функция для отправки данных в Airtable
async function sendFirstAirtable(tgId, name, nickname) {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const idId = process.env.AIRTABLE_IDS_ID;

  const url = `https://api.airtable.com/v0/${baseId}/${idId}`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const data = {
    fields: {
      tgId: tgId,
      FIO: name,
      Nickname: nickname,
    },
  };

  try {
    const response = await axios.post(url, data, { headers });
    return response.data.id; // Возвращаем идентификатор записи
    // await axios.post(url, data, { headers });
  } catch (error) {
    console.error(
      "Error sending data to Airtable:",
      error.response ? error.response.data : error.message
    );
  }
}

// Функция для обновления записи в Airtable
async function updateAirtableRecord(id, city, studio) {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableId = process.env.AIRTABLE_IDS_ID;

  const url = `https://api.airtable.com/v0/${baseId}/${tableId}/${id}`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const data = {
    fields: {
      City: city,
      Studio: studio,
    },
  };

  try {
    await axios.patch(url, data, { headers }); // Используем PATCH для обновления
  } catch (error) {
    console.error(
      "Error updating data in Airtable:",
      error.response ? error.response.data : error.message
    );
  }
}

// Функция для отправки данных в Airtable
async function sendToAirtable(name, email, phone, tgId, city, studio) {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableId = process.env.AIRTABLE_LEADS_ID;

  const url = `https://api.airtable.com/v0/${baseId}/${tableId}`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const data = {
    fields: {
      FIO: name,
      email: email,
      Phone: phone,
      tgId: tgId,
      City: city,
      Studio: studio,
    },
  };

  try {
    await axios.post(url, data, { headers });
  } catch (error) {
    console.error(
      "Error sending data to Airtable:",
      error.response ? error.response.data : error.message
    );
  }
}

// Функция для отправки данных в Airtable 2
async function sendTwoToAirtable(tgId, invId, sum, lessons, tag, date, nick) {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const buyId = process.env.AIRTABLE_BUY_ID;

  const url = `https://api.airtable.com/v0/${baseId}/${buyId}`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const data = {
    fields: {
      tgId: tgId,
      inv_id: invId,
      Sum: sum,
      Lessons: lessons,
      Tag: tag,
      Date: date,
      Nickname: nick,
    },
  };

  try {
    await axios.post(url, data, { headers });
  } catch (error) {
    console.error(
      "Error sending data to Airtable:",
      error.response ? error.response.data : error.message
    );
  }
}

// Создаем и настраиваем Express-приложение
const app = express();
app.use(bodyParser.json()); // Используем JSON для обработки запросов от Telegram и Робокассы

// Обработчик команд бота
bot.command("start", async (ctx) => {
  try {
    await Session.findOneAndUpdate(
      { userId: ctx.from.id.toString() },
      { userId: ctx.from.id.toString(), step: "start" },
      { upsert: true }
    );

    const fullName = `${ctx.from.first_name} ${
      ctx.from.last_name || ""
    }`.trim();

    // Сохраняем идентификатор записи в сессии
    const airtableId = await sendFirstAirtable(
      ctx.from.id,
      fullName,
      ctx.from.username
    );
    const session = await Session.findOne({ userId: ctx.from.id.toString() });
    session.airtableId = airtableId; // Сохраняем airtableId в сессии
    await session.save();

    // await sendFirstAirtable(ctx.from.id, fullName, ctx.from.username);

    await ctx.reply(
      "Привет! Подскажите, пожалуйста, какой город вас интересует?",
      {
        reply_markup: new InlineKeyboard()
          .add({ text: "Москва", callback_data: "city_moscow" })
          .row()
          .add({ text: "Санкт-Петербург", callback_data: "city_spb" })
          .row()
          .add({ text: "Ереван", callback_data: "city_yerevan" }),
      }
    );
  } catch (error) {
    console.error("Произошла ошибка:", error);
  }
});

// Обработчик выбора города
bot.on("callback_query:data", async (ctx) => {
  const action = ctx.callbackQuery.data;
  const session = await Session.findOne({ userId: ctx.from.id.toString() });

  if (
    action === "city_moscow" ||
    action === "city_spb" ||
    action === "city_yerevan"
  ) {
    let city;
    let studiosKeyboard;
    if (action === "city_moscow") {
      city = "Москва";
      // Кнопки для студий в Москве
      studiosKeyboard = new InlineKeyboard().add({
        text: "Студия на м. 1905г.",
        callback_data: "studio_ycg",
      });
    } else if (action === "city_spb") {
      city = "Санкт-Петербург";
      // Кнопки для студий в Санкт-Петербурге
      studiosKeyboard = new InlineKeyboard()
        .add({ text: "Студия на м. Петроградкая", callback_data: "studio_rtc" })
        .row()
        .add({ text: "Студия на м. Выборгская", callback_data: "studio_hkc" })
        .row()
        .add({
          text: "Студия на м. Московские Ворота",
          callback_data: "studio_spi",
        });
    } else if (action === "city_yerevan") {
      city = "Ереван";
      // Кнопки для студий в Ереване
      studiosKeyboard = new InlineKeyboard().add({
        text: "Студия на Бузанда",
        callback_data: "studio_gof",
      });
    }

    // Сохраняем город в сессии
    session.city = city;
    await session.save();

    // Отправляем сообщение с выбором студии
    await ctx.reply(`Выберите, пожалуйста, студию:`, {
      reply_markup: studiosKeyboard,
    });
  }
  // Обрабатываем выбор студии
  else if (action.startsWith("studio_")) {
    let studio;
    if (action === "studio_ycg") {
      studio = "Студия на м. 1905г.";
    } else if (action === "studio_rtc") {
      studio = "Студия на м. Петроградская";
    } else if (action === "studio_hkc") {
      studio = "Студия на м. Выборгская";
    } else if (action === "studio_spi") {
      studio = "Студия на м. Московские Ворота";
    } else if (action === "studio_gof") {
      studio = "Студия на Бузанда";
    }

    // Сохраняем выбранную студию в сессии
    session.studio = studio;
    await session.save();

    // Обновляем запись в Airtable
    await updateAirtableRecord(session.airtableId, session.city, studio);

    // Отправляем сообщение с выбором студии
    await ctx.reply(
      "Наши тренировки помогут вам:\n▫️Стать сильнее\n▫️Повысить тонус\n▫️Научиться владеть телом\n▫️Найти друзей и единомышленников\n\nВоспользуйтесь нижним меню, чтобы выбрать нужную команду.",
      {
        reply_markup: new Keyboard()
          .text("Записаться на тренировку")
          .row()
          .text("Как проходят тренировки")
          .text("Цены и расписание")
          .row()
          .text("Назад")
          .text("FAQ")
          .resized(), // делает клавиатуру компактной
      }
    );
  }
  // Добавляем обработчик для "Поменять город"
  else if (action === "change_city") {
    await ctx.reply("Выберите город:", {
      reply_markup: new InlineKeyboard()
        .add({ text: "Москва", callback_data: "city_moscow" })
        .row()
        .add({ text: "Санкт-Петербург", callback_data: "city_spb" })
        .row()
        .add({ text: "Ереван", callback_data: "city_yerevan" }),
    });
  } else if (action === "edit_info") {
    await ctx.reply(messages.editChoice, {
      reply_markup: new InlineKeyboard()
        .add({ text: "ФИ", callback_data: "edit_name" })
        .add({ text: "Телефон", callback_data: "edit_phone" })
        .add({ text: "E-mail", callback_data: "edit_email" }),
    });
    session.step = "awaiting_edit";
    await session.save(); // Сохранение сессии после изменения шага
  } else if (action.startsWith("edit_")) {
    session.step = `awaiting_edit_${action.replace("edit_", "")}`;
    await ctx.reply(
      messages[
        `enter${
          action.replace("edit_", "").charAt(0).toUpperCase() +
          action.replace("edit_", "").slice(1)
        }`
      ]
    );
    await session.save(); // Сохранение сессии после изменения шага
  } else if (session.step === "awaiting_confirmation") {
    if (action === "confirm_payment") {
      await ctx.reply("Спасибо! На какую тренировку хотите записаться?", {
        reply_markup: new InlineKeyboard()
          .add({ text: "Групповую", callback_data: "group_training" })
          .row()
          .add({
            text: "Персональную (или сплит)",
            callback_data: "personal_training",
          }),
      });

      // Отправляем данные в Airtable
      await sendToAirtable(
        session.name, // Имя пользователя
        session.email, // Email пользователя
        session.phone, // Телефон пользователя
        ctx.from.id, // Telegram ID пользователя
        session.city, // Телефон пользователя
        session.studio // Телефон пользователя
      );

      session.step = "awaiting_training_type";
      await session.save(); // Сохранение сессии после изменения шага
    }
  } else if (session.step === "awaiting_training_type") {
    if (action === "group_training") {
      // Получаем данные студии из сессии и telegram_id
      const studio = session.studio; // Берем студию из сессии
      const telegramId = ctx.from.id; // ID пользователя Telegram

      // Отправляем данные на вебхук
      await sendToWebhook(studio, telegramId);

      // Ответ пользователю
      await ctx.reply("Загружаю расписание");

      // Сохраняем шаг, если нужно
      session.step = "awaiting_next_step";
      await session.save();
    } else if (action === "personal_training") {
      // Персональная тренировка - показываем персональное меню
      await ctx.reply(
        "Вы выбрали персональную тренировку. Свяжитесь с менеджером для уточнения деталей."
      );

      session.step = "completed";
      await session.save();
    }
  } else if (action.startsWith("day")) {
    const buttonText = action.split(",")[1];
    const date = buttonText.match(/\(([^)]+)\)/);
    const str = JSON.stringify(date[1]);
    console.log(str);

    // Генерация ссылки на оплату и получение paymentId
    const { paymentLink, paymentId } = await generatePaymentLinkForStudio(
      session.studio,
      session.email
    );

    await ctx.reply(
      `Отлично! Вы выбрали: ${buttonText}\nДля подтверждения записи оплатите, пожалуйста, тренировку по ссылке ниже.\n\nПосле оплаты вы получите сообщение с подтверждением записи.`
    );
    await ctx.reply(`Перейдите по ссылке для оплаты: ${paymentLink}`);
    session.step = "completed";
    await session.save();
    // Отправка данных в Airtable
    const sum = studioDetails[session.studio].price;
    const lessons = 1;
    const tag = studioDetails[session.studio].tag; // Берем тег из студии
    await sendTwoToAirtable(
      ctx.from.id,
      paymentId,
      sum,
      lessons,
      tag,
      str,
      ctx.from.username
    );
  }
});

// Обработчик для нажатий обычных кнопок
bot.on("message:text", async (ctx) => {
  const session = await Session.findOne({ userId: ctx.from.id.toString() });
  const userMessage = ctx.message.text;

  // Обработка кнопок для студий
  if (userMessage === "Записаться на тренировку") {
    // Удаляем стационарное меню
    await ctx.reply("Меню скрыто, готовим вас к записи..", {
      reply_markup: {
        remove_keyboard: true, // Удаляет текущее стационарное меню
      },
    });

    // Устанавливаем этап в сессии
    session.step = "awaiting_name";
    await session.save(); // Сохраняем состояние сессии

    // Задержка на 1 секунду перед отправкой запроса на ввод ФИО
    setTimeout(async () => {
      await ctx.reply("Пожалуйста, введите ваше ФИО:");
    }, 1000); // 1000 миллисекунд = 1 секунда
  } else if (userMessage === "Как проходят тренировки") {
    await ctx.reply(
      "У нас не обычные групповые тренировки, где все ученики делают одинаковые задания — у нас персональный подход.\n\nНа первом занятии тренер определит ваш уровень физической подготовки и обсудит основные цели. После этого все тренировки будут написаны с учетом вашего уровня и целей 🔥\n\nМы это делаем с помощью мобильного приложения, где у вас будет свой личный кабинет, история тренировок и результаты❗️\n\nТак мы добиваемся наиболее эффективного подхода для наших учеников 🤍"
    );
  } else if (userMessage === "Цены и расписание") {
    const priceAndSchedule = getPriceAndSchedule(session.studio);
    await ctx.reply(priceAndSchedule);
  } else if (userMessage === "Назад") {
    // Возвращаем клавиатуру для выбора студии в зависимости от города
    let studiosKeyboard;

    if (session.city === "Москва") {
      studiosKeyboard = new InlineKeyboard()
        .add({ text: "Студия на м. 1905г.", callback_data: "studio_ycg" })
        .row()
        .add({ text: "Поменять город", callback_data: "change_city" });
    } else if (session.city === "Санкт-Петербург") {
      studiosKeyboard = new InlineKeyboard()
        .add({ text: "Студия на м. Петроградкая", callback_data: "studio_rtc" })
        .row()
        .add({ text: "Студия на м. Выборгская", callback_data: "studio_hkc" })
        .row()
        .add({
          text: "Студия на м. Московские Ворота",
          callback_data: "studio_spi",
        })
        .row()
        .add({ text: "Поменять город", callback_data: "change_city" });
    } else if (session.city === "Ереван") {
      studiosKeyboard = new InlineKeyboard()
        .add({ text: "Студия на Бузанда", callback_data: "studio_gof" })
        .row()
        .add({ text: "Поменять город", callback_data: "change_city" });
    }

    // Отправляем сообщение с выбором студии
    await ctx.reply("Выберите студию или поменяйте город:", {
      reply_markup: studiosKeyboard,
    });
  } else if (userMessage === "FAQ") {
    await ctx.reply(
      "По ссылке ниже вы найдете ответы на часто задаваемые вопросы о наших тренировках. \n\nКому подходят такие тренировки, есть ли противопоказания, сколько длятся занятия, как приобрести подарочный сертификат и другие вопросы. \n\nЕсли вы не нашли ответ на свой вопрос, задайте его боту, написав в открытом сообщении ↘️",
      {
        reply_markup: new InlineKeyboard().url(
          "Читать FAQ",
          "https://telegra.ph/I-Do-Calisthenics-FAQ-02-06"
        ),
      }
    );
  } else if (session.step === "awaiting_name") {
    session.name = ctx.message.text;
    await ctx.reply(messages.enterPhone);
    session.step = "awaiting_phone";
    await session.save(); // Сохранение сессии после изменения шага
  } else if (session.step === "awaiting_phone") {
    const phone = ctx.message.text;
    if (/^\+\d+$/.test(phone)) {
      session.phone = phone;
      await ctx.reply(messages.enterEmail);
      session.step = "awaiting_email";
      await session.save(); // Сохранение сессии после изменения шага
    } else {
      await ctx.reply(messages.invalidPhone);
    }
  } else if (session.step === "awaiting_email") {
    session.email = ctx.message.text;
    const confirmationMessage = messages.confirmation
      .replace("{{ $ФИ }}", session.name)
      .replace("{{ $Tel }}", session.phone)
      .replace("{{ $email }}", session.email);

    await ctx.reply(confirmationMessage, {
      reply_markup: new InlineKeyboard()
        .add({ text: "Все верно", callback_data: "confirm_payment" })
        .row()
        .add({ text: "Изменить", callback_data: "edit_info" }),
    });

    session.step = "awaiting_confirmation";
    await session.save(); // Сохранение сессии после изменения шага
  } else if (session.step.startsWith("awaiting_edit_")) {
    const field = session.step.replace("awaiting_edit_", "");
    if (field === "name") {
      session.name = ctx.message.text;
    } else if (field === "phone") {
      const phone = ctx.message.text;
      if (/^\+\d+$/.test(phone)) {
        session.phone = phone;
      } else {
        await ctx.reply(messages.invalidPhone);
        return;
      }
    } else if (field === "email") {
      session.email = ctx.message.text;
    }

    const confirmationMessage = messages.confirmation
      .replace("{{ $ФИ }}", session.name)
      .replace("{{ $Tel }}", session.phone)
      .replace("{{ $email }}", session.email);

    await ctx.reply(confirmationMessage, {
      reply_markup: new InlineKeyboard()
        .add({ text: "Все верно", callback_data: "confirm_payment" })
        .row()
        .add({ text: "Изменить", callback_data: "edit_info" }),
    });

    session.step = "awaiting_confirmation";
    await session.save(); // Сохранение сессии после изменения шага
  }
});

// Обработчик команды /operator
bot.command("operator", async (ctx) => {
  try {
    await ctx.reply(
      "Если у вас остались вопросы, вы можете написать нашему менеджеру Никите: @IDC_Manager, он подскажет 😉"
    );
  } catch (error) {
    console.error("Произошла ошибка:", error);
  }
});

// Запуск бота
bot.start();
