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

const userState = {};
// Логируем запуск приложения с информацией о пользователе
console.log("Приложение запущено");

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
async function createStripePriceAMD() {
  const price = await stripe.prices.create({
    unit_amount: 1000, // 10 евро в центах
    currency: "amd",
    product_data: {
      name: "Armenia",
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
  } else if (studioInfo.paymentSystem === "stripeAMD") {
    // Генерация ссылки для Stripe
    const priceId = await createStripePriceAMD(
      studioInfo.price,
      currency,
      studio
    );
    const paymentLink = await createStripePaymentLink(priceId, paymentId);
    return { paymentLink, paymentId };
  } else {
    throw new Error("Неизвестная платёжная система");
  }
}

async function generateSecondPaymentLinkForStudio(buy, email) {
  const actionInfo = actionData[buy];

  if (!actionInfo) {
    throw new Error("Информация не найдена");
  }

  const paymentId = generateUniqueId(); // Генерируем уникальный ID для платежа
  const sum = actionInfo.sum;
  const currency = actionInfo.currency;
  const e = email;

  if (actionInfo.paymentSystem === "robokassa") {
    // Генерация ссылки для Robokassa
    const paymentLink = generatePaymentLink(paymentId, sum, e);
    return { paymentLink, paymentId };
  } else if (actionInfo.paymentSystem === "stripe") {
    // Генерация ссылки для Stripe
    const priceId = await createStripePrice(actionInfo.sum, currency, studio);
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

const actionData = {
  buy_13200_msc_ycg: {
    sum: 13200,
    lessons: 12,
    tag: "MSC_group_YCG",
    currency: "RUB",
    paymentSystem: "robokassa",
  },
  buy_1400_msc_ycg: {
    sum: 1400,
    lessons: 1,
    tag: "MSC_group_YCG",
    currency: "RUB",
    paymentSystem: "robokassa",
  },
  buy_3600_personal_mscycg: {
    sum: 3600,
    lessons: 1,
    tag: "MSC_personal_YCG",
    currency: "RUB",
    paymentSystem: "robokassa",
  },
  buy_32400_personal_mscycg: {
    sum: 32400,
    lessons: 10,
    tag: "MSC_personal_YCG",
    currency: "RUB",
    paymentSystem: "robokassa",
  },
  buy_5000_personal_mscycg: {
    sum: 5000,
    lessons: 1,
    tag: "MSC_personal_YCG",
    currency: "RUB",
    paymentSystem: "robokassa",
  },
  buy_6000_personal_mscycg: {
    sum: 6000,
    lessons: 1,
    tag: "MSC_personal_YCG",
    currency: "RUB",
    paymentSystem: "robokassa",
  },
  buy_11400_spb_spi: {
    sum: 11400,
    lessons: 12,
    tag: "SPB_group_SPI",
    currency: "RUB",
    paymentSystem: "robokassa",
  },
  buy_9600_spb_spi: {
    sum: 9600,
    lessons: 12,
    tag: "SPB_group_SPI",
    currency: "RUB",
    paymentSystem: "robokassa",
  },
  buy_1100_spb_spi: {
    sum: 1100,
    lessons: 1,
    tag: "SPB_group_SPI",
    currency: "RUB",
    paymentSystem: "robokassa",
  },
  buy_3600_personal_spbspi: {
    sum: 3600,
    lessons: 1,
    tag: "SPB_personal_SPI",
    currency: "RUB",
    paymentSystem: "robokassa",
  },
  buy_32400_personal_spbspi: {
    sum: 32400,
    lessons: 10,
    tag: "SPB_personal_SPI",
    currency: "RUB",
    paymentSystem: "robokassa",
  },
  buy_5000_personal_spbspi: {
    sum: 5000,
    lessons: 1,
    tag: "SPB_personal_SPI",
    currency: "RUB",
    paymentSystem: "robokassa",
  },
  buy_6000_personal_spbspi: {
    sum: 6000,
    lessons: 1,
    tag: "SPB_personal_SPI",
    currency: "RUB",
    paymentSystem: "robokassa",
  },
  buy_11400_spb_rtc: {
    sum: 11400,
    lessons: 12,
    tag: "SPB_group_RTC",
    currency: "RUB",
    paymentSystem: "robokassa",
  },
  buy_9600_spb_rtc: {
    sum: 9600,
    lessons: 12,
    tag: "SPB_group_RTC",
    currency: "RUB",
    paymentSystem: "robokassa",
  },
  buy_1100_spb_rtc: {
    sum: 1100,
    lessons: 1,
    tag: "SPB_group_RTC",
    currency: "RUB",
    paymentSystem: "robokassa",
  },
  buy_3600_personal_spbrtc: {
    sum: 3600,
    lessons: 1,
    tag: "SPB_personal_RTC",
    currency: "RUB",
    paymentSystem: "robokassa",
  },
  buy_32400_personal_spbrtc: {
    sum: 32400,
    lessons: 10,
    tag: "SPB_personal_RTC",
    currency: "RUB",
    paymentSystem: "robokassa",
  },
  buy_5000_personal_spbrtc: {
    sum: 5000,
    lessons: 1,
    tag: "SPB_personal_RTC",
    currency: "RUB",
    paymentSystem: "robokassa",
  },
  buy_6000_personal_spbrtc: {
    sum: 6000,
    lessons: 1,
    tag: "SPB_personal_RTC",
    currency: "RUB",
    paymentSystem: "robokassa",
  },
  buy_11400_spb_hkc: {
    sum: 11400,
    lessons: 12,
    tag: "SPB_group_HKC",
    currency: "RUB",
    paymentSystem: "robokassa",
  },
  buy_9600_spb_hkc: {
    sum: 9600,
    lessons: 12,
    tag: "SPB_group_HKC",
    currency: "RUB",
    paymentSystem: "robokassa",
  },
  buy_1100_spb_hkc: {
    sum: 1100,
    lessons: 1,
    tag: "SPB_group_HKC",
    currency: "RUB",
    paymentSystem: "robokassa",
  },
  buy_3600_personal_spbhkc: {
    sum: 3600,
    lessons: 1,
    tag: "SPB_personal_HKC",
    currency: "RUB",
    paymentSystem: "robokassa",
  },
  buy_32400_personal_spbhkc: {
    sum: 32400,
    lessons: 10,
    tag: "SPB_personal_HKC",
    currency: "RUB",
    paymentSystem: "robokassa",
  },
  buy_5000_personal_spbhkc: {
    sum: 5000,
    lessons: 1,
    tag: "SPB_personal_HKC",
    currency: "RUB",
    paymentSystem: "robokassa",
  },
  buy_6000_personal_spbhkc: {
    sum: 6000,
    lessons: 1,
    tag: "SPB_personal_HKC",
    currency: "RUB",
    paymentSystem: "robokassa",
  },
  buy_1100_dsdasha_rub: { sum: 1100, lessons: 1, tag: "ds_dasha_rub" },
  buy_9600_dsdasha_rub: { sum: 9600, lessons: 12, tag: "ds_dasha_rub" },
  buy_23400_dsdasha_rub: { sum: 23400, lessons: 36, tag: "ds_dasha_rub" },
  buy_105_dsdasha_eur: { sum: 105, lessons: 12, tag: "ds_dasha_eur" },
  buy_249_dsdasha_eur: { sum: 249, lessons: 36, tag: "ds_dasha_eur" },
  buy_60000_yvn_amd: {
    sum: 1,
    lessons: 12,
    tag: "YVN_group_GFG",
    currency: "AMD",
    paymentSystem: "stripeAMD",
  },
  buy_7000_yvn_amd: {
    sum: 249,
    lessons: 1,
    tag: "YVN_group_GFG",
    currency: "AMD",
    paymentSystem: "stripeAMD",
  },
};

// Объект с данными для различных типов кнопок
const buttonsData = {
  group: {
    MSCYCG: [
      {
        text: "12 занятий (13 200₽) — действует 6 недель",
        callback_data: "buy_13200_msc_ycg",
      },
      {
        text: "1 занятие (1 400₽) — действует 4 недели",
        callback_data: "buy_1400_msc_ycg",
      },
    ],
    SPBSPI: [
      {
        text: "12 занятий (11 400₽) — действует 6 недель",
        callback_data: "buy_11400_spb_spi",
      },
      {
        text: "12 занятий (9 600₽) — действует 4 недели",
        callback_data: "buy_9600_spb_spi",
      },
      {
        text: "1 занятие (1 100₽) — действует 4 недели",
        callback_data: "buy_1100_spb_spi",
      },
    ],
    SPBRTC: [
      {
        text: "12 занятий (11 400₽) — действует 6 недель",
        callback_data: "buy_11400_spb_rtc",
      },
      {
        text: "12 занятий (9 600₽) — действует 4 недели",
        callback_data: "buy_9600_spb_rtc",
      },
      {
        text: "1 занятие (1 100₽) — действует 4 недели",
        callback_data: "buy_1100_spb_rtc",
      },
    ],
    SPBHKC: [
      {
        text: "12 занятий (11 400₽) — действует 6 недель",
        callback_data: "buy_11400_spb_hkc",
      },
      {
        text: "12 занятий (9 600₽) — действует 4 недели",
        callback_data: "buy_9600_spb_hkc",
      },
      {
        text: "1 занятие (1 100₽) — действует 4 недели",
        callback_data: "buy_1100_spb_hkc",
      },
    ],
  },
  personal: {
    MSCYCG: [
      {
        text: "10 занятий (32 400₽) — действует 6 недель",
        callback_data: "buy_32400_personal_mscycg",
      },
      {
        text: "1 занятие (3 600₽) — действует 4 недели",
        callback_data: "buy_3600_personal_mscycg",
      },
      {
        text: "Сплит на двоих (5 000₽) — действует 4 недели",
        callback_data: "buy_5000_personal_mscycg",
      },
      {
        text: "Сплит на троих (6 000₽) — действует 4 недели",
        callback_data: "buy_6000_personal_mscycg",
      },
    ],
    SPBSPI: [
      {
        text: "10 занятий (32 400₽) — действует 6 недель",
        callback_data: "buy_32400_personal_spbspi",
      },
      {
        text: "1 занятие (3 600₽) — действует 4 недели",
        callback_data: "buy_3600_personal_spbspi",
      },
      {
        text: "Сплит на двоих (5 000₽) — действует 4 недели",
        callback_data: "buy_5000_personal_spbspi",
      },
      {
        text: "Сплит на троих (6 000₽) — действует 4 недели",
        callback_data: "buy_6000_personal_spbspi",
      },
    ],
    SPBRTC: [
      {
        text: "10 занятий (32 400₽) — действует 6 недель",
        callback_data: "buy_32400_personal_spbrtc",
      },
      {
        text: "1 занятие (3 600₽) — действует 4 недели",
        callback_data: "buy_3600_personal_spbrtc",
      },
      {
        text: "Сплит на двоих (5 000₽) — действует 4 недели",
        callback_data: "buy_5000_personal_spbrtc",
      },
      {
        text: "Сплит на троих (6 000₽) — действует 4 недели",
        callback_data: "buy_6000_personal_spbrtc",
      },
    ],
    SPBHKC: [
      {
        text: "10 занятий (32 400₽) — действует 6 недель",
        callback_data: "buy_32400_personal_spbhkc",
      },
      {
        text: "1 занятие (3 600₽) — действует 4 недели",
        callback_data: "buy_3600_personal_spbhkc",
      },
      {
        text: "Сплит на двоих (5 000₽) — действует 4 недели",
        callback_data: "buy_5000_personal_spbhkc",
      },
      {
        text: "Сплит на троих (6 000₽) — действует 4 недели",
        callback_data: "buy_6000_personal_spbhkc",
      },
    ],
  },
  amd: {
    YVNGFG: [
      {
        text: "12 занятий (60 000AMD) — действует 6 недель",
        callback_data: "buy_60000_yvn_amd",
      },
      {
        text: "1 занятие (7 000AMD) — действует 4 недели",
        callback_data: "buy_7000_yvn_amd",
      },
    ],
  },
  ds: {
    RUBDASHA: [
      {
        text: "1 занятие (1 100₽) — действует 4 недели",
        callback_data: "buy_1100_dsdasha_rub",
      },
      {
        text: "12 занятий (9 600₽) — действует 6 недель",
        callback_data: "buy_9600_dsdasha_rub",
      },
      {
        text: "36 занятий (23 400₽) — действует 14 недель",
        callback_data: "buy_23400_dsdasha_rub",
      },
    ],
    EURDASHA: [
      {
        text: "12 занятий (105€) — действует 6 недель",
        callback_data: "buy_105_dsdasha_eur",
      },
      {
        text: "36 занятий (249€) — действует 14 недель",
        callback_data: "buy_249_dsdasha_eur",
      },
    ],
  },
};

const studioDetails = {
  "м. 1905г.": {
    price: 950,
    currency: "RUB",
    tag: "01MSC_group_YCG_start",
    paymentSystem: "robokassa", // Использовать Robokassa для России
  },
  "м. Петроградская": {
    price: 2,
    currency: "RUB",
    tag: "01SPB_group_RTC_start",
    paymentSystem: "robokassa", // Использовать Robokassa для России
  },
  "м. Выборгская": {
    price: 3,
    currency: "RUB",
    tag: "01SPB_group_HKC_start",
    paymentSystem: "robokassa",
  },
  "м. Московские Ворота": {
    price: 4,
    currency: "RUB",
    tag: "01SPB_group_SPI_start",
    paymentSystem: "robokassa",
  },
  "ул. Бузанда": {
    price: 100,
    currency: "AMD",
    tag: "01YVN_group_GFG_start",
    paymentSystem: "stripeAMD", // Использовать Stripe для Еревана
  },
};

// Функция для получения данных о ценах и расписании в зависимости от студии
function getPriceAndSchedule(studio) {
  const priceSchedule = {
    "м. 1905г.":
      "Адрес студии м. 1905г.: \nм. Ул. Большая Декабрьская, д.3 с25\n\n🔻 Расписание занятий:\nВторник 18:40 и 20:00\nЧетверг 18:40 и 20:00\nСуббота 12:00\n\n🔻 Стоимость тренировок:\n👉🏻Пробное - 950₽ (действует 4 недели)\n👉🏻12 занятий - 11400₽ (действует 6 недель)\n👉🏻1 занятие - 1100₽ (действует 4 недели)\n\n🔻 Цены индивидуальных тренировок:\n1 тренировка (1 чел.) - 3600₽ за занятие\n1 тренировка (2 чел.) - 5000₽ за занятие\n1 тренировка (3 чел.) - 6000₽ за занятие",
    "м. Петроградская":
      "Адрес студии м. Петроградская.:\n  Ул. Газовая 10Н\n\n🔻 Расписание занятий:\nВторник 20:00\nЧетверг 20:00\nСуббота 14:00\n\n🔻 Стоимость тренировок:\n👉🏻 Пробное занятие - 950₽ (действует 4 недели)\n👉🏻Абонемент на 12 тренировок (действует 4 недели) - 9 600₽\n👉🏻Абонемент на 12 тренировок (действует 6 недели) - 11 400₽\n👉🏻1 тренировка - 1 100₽ (действует 4 недели)\n\n🔻 Цены индивидуальных тренировок:\n1 тренировка (1 чел.) - 3 600₽ за занятие\n1 тренировка (2 чел.) - 5 000₽ за занятие\n1 тренировка (3 чел.) - 6 000₽ за занятие",
    "м. Выборгская":
      "Адрес студии м. Выборгская.:\n Малый Сампсониевский пр., дом 2\n\n🔻 Расписание занятий:\nВторник 20:30\nЧетверг 20:30\nСуббота 14:00\n\n🔻 Стоимость тренировок:\n👉🏻Пробное занятие - 950₽ (действует 4 недели)\n👉🏻Абонемент на 12 тренировок (действует 4 недели) - 9 600₽\n👉🏻Абонемент на 12 тренировок (действует 6 недель) - 11 400₽\n👉🏻1 тренировка - 1 100₽ (действует 4 недели)\n\n🔻 Цены индивидуальных тренировок:\n1 тренировка (1 чел.) - 3 600₽ за занятие\n1 тренировка (2 чел.) - 5 000₽ за занятие\n1 тренировка (3 чел.) - 6 000₽ за занятие",
    "м. Московские Ворота":
      "Адрес студии м. Выборгская.:\n  Ул. Заставская, 33П\n\n🔻 Расписание занятий:\nВторник 20:40\nЧетверг 20:40\nСуббота 14:00\n\n🔻 Стоимость тренировок:\n👉🏻Пробное занятие - 950₽ (действует 4 недели)\n👉🏻Абонемент на 12 тренировок (действует 4 недели) - 9 600₽\n👉🏻Абонемент на 12 тренировок (действует 6 недель) - 11 400₽\n👉🏻1 тренировка - 1 100₽ (действует 4 недели)\n\n🔻 Цены индивидуальных тренировок:\n1 тренировка (1 чел.) - 3 600₽ за занятие\n1 тренировка (2 чел.) - 5 000₽ за занятие\n1 тренировка (3 чел.) - 6 000₽ за занятие",
    "ул. Бузанда":
      "Адрес студии на ул. Бузанда.:\n Ул. Павстоса Бузанда, 1/3\n\n🔻 Расписание занятий:\nПонедельник 08:30 (утро) \nСреда 08:30 (утро) \nПятница 08:30 (утро) \n\n🔻 Стоимость тренировок:\n👉🏻Пробное занятие - 5000 AMD (действует 4 недели)\n👉🏻Абонемент на 12 тренировок (действует 6 недель) - 60 000 AMD\n👉🏻1 тренировка - 7 000 AMD (действует 4 недели)\n\n🔻 Цены индивидуальных тренировок:\n1 тренировка (1 чел.) - 12 500 AMD за занятие\n1 тренировка (2 чел.) - 17 000 AMD за занятие\n1 тренировка (3 чел.) - 21 000 AMD за занятие",
  };

  return (
    priceSchedule[studio] || "Цена и расписание зависят от выбранной программы."
  );
}

// Функция для получения информации о пользователе из Airtable
async function getUserInfo(tgId) {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const clientsId = process.env.AIRTABLE_CLIENTS_ID;

  const url = `https://api.airtable.com/v0/${baseId}/${clientsId}?filterByFormula={tgId}='${tgId}'`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
  };

  try {
    const response = await axios.get(url, { headers });
    const records = response.data.records;

    if (records.length > 0) {
      const email = records[0].fields.email || "нет email"; // Если email отсутствует, выводим сообщение
      const tag = records[0].fields.Tag || "неизвестен"; // Если тег отсутствует, выводим "неизвестен"
      const balance =
        records[0].fields.Balance !== undefined
          ? records[0].fields.Balance
          : "0";
      const currency = records[0].fields.Currency || "неизвестна"; // Если валюты нет, выводим "неизвестна"
      return { email, tag, balance, currency };
    } else {
      return null; // Если запись не найдена, возвращаем null
    }
  } catch (error) {
    console.error(
      "Error fetching user info from Airtable:",
      error.response ? error.response.data : error.message
    );
    return null; // В случае ошибки возвращаем null
  }
}

// Функция для генерации клавиатуры на основе тега пользователя
function generateKeyboard(tag) {
  let keyboard = new InlineKeyboard();
  console.log("Отправляю кнопки для оплаты");

  if (tag === "ds_dasha_rub") {
    buttonsData.ds.RUBDASHA.forEach((button) => keyboard.add(button).row());
  } else if (tag === "ds_dasha_eur") {
    buttonsData.ds.EURDASHA.forEach((button) => keyboard.add(button).row());
  } else if (tag === "MSC_group_YCG") {
    buttonsData.group.MSCYCG.forEach((button) => keyboard.add(button).row());
  } else if (tag === "SPB_group_SPI") {
    buttonsData.group.SPBSPI.forEach((button) => keyboard.add(button).row());
  } else if (tag === "SPB_group_RTC") {
    buttonsData.group.SPBRTC.forEach((button) => keyboard.add(button).row());
  } else if (tag === "SPB_group_HKC") {
    buttonsData.group.SPBHKC.forEach((button) => keyboard.add(button).row());
  } else if (tag === "MSC_personal_YCG") {
    buttonsData.personal.MSCYCG.forEach((button) => keyboard.add(button).row());
  } else if (tag === "SPB_personal_SPI") {
    buttonsData.personal.SPBSPI.forEach((button) => keyboard.add(button).row());
  } else if (tag === "SPB_personal_RTC") {
    buttonsData.personal.SPBRTC.forEach((button) => keyboard.add(button).row());
  } else if (tag === "SPB_personal_HKC") {
    buttonsData.personal.SPBHKC.forEach((button) => keyboard.add(button).row());
  } else if (tag === "ds") {
    buttonsData.ds.forEach((button) => keyboard.add(button).row());
  } else if (tag === "YVN_group_GFG") {
    buttonsData.amd.YVNGFG.forEach((button) => keyboard.add(button).row());
  } else {
    // Если тег не распознан, возвращаем null
    return null;
  }
  return keyboard;
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

// Функция для проверки наличия пользователя в Airtable
async function checkUserInAirtable(tgId) {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const clientsId = process.env.AIRTABLE_CLIENTS_ID;

  const url = `https://api.airtable.com/v0/${baseId}/${clientsId}?filterByFormula={tgId}='${tgId}'`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
  };

  try {
    const response = await axios.get(url, { headers });
    console.log(
      `Результат проверки пользователя: ${response.data.records.length > 0}`
    );
    return response.data.records.length > 0; // Если записи найдены, возвращаем true
  } catch (error) {
    console.error(
      "Error checking user in Airtable:",
      error.response ? error.response.data : error.message
    );
    return false; // В случае ошибки также возвращаем false
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

// Функция для отправки данных в Airtable 2
async function thirdTwoToAirtable(tgId, invId, sum, lessons, tag) {
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

    const tgId = ctx.from.id; // Сохранение tgId пользователя
    // Проверка наличия пользователя в Airtable
    const userExists = await checkUserInAirtable(tgId);

    if (userExists) {
      // Если пользователь уже есть в базе, выполняем сценарий для существующих пользователей
      await handleExistingUserScenario(ctx);
    } else {
      // Сохраняем идентификатор записи в сессии
      const airtableId = await sendFirstAirtable(
        ctx.from.id,
        fullName,
        ctx.from.username
      );
      const session = await Session.findOne({ userId: ctx.from.id.toString() });
      session.airtableId = airtableId; // Сохраняем airtableId в сессии
      await session.save();

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
    }
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
        text: "м. 1905г.",
        callback_data: "studio_ycg",
      });
    } else if (action === "city_spb") {
      city = "Санкт-Петербург";
      // Кнопки для студий в Санкт-Петербурге
      studiosKeyboard = new InlineKeyboard()
        .add({ text: "м. Петроградкая", callback_data: "studio_rtc" })
        .row()
        .add({ text: "м. Выборгская", callback_data: "studio_hkc" })
        .row()
        .add({
          text: "м. Московские Ворота",
          callback_data: "studio_spi",
        });
    } else if (action === "city_yerevan") {
      city = "Ереван";
      // Кнопки для студий в Ереване
      studiosKeyboard = new InlineKeyboard().add({
        text: "ул. Бузанда",
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
      studio = "м. 1905г.";
    } else if (action === "studio_rtc") {
      studio = "м. Петроградская";
    } else if (action === "studio_hkc") {
      studio = "м. Выборгская";
    } else if (action === "studio_spi") {
      studio = "м. Московские Ворота";
    } else if (action === "studio_gof") {
      studio = "ул. Бузанда";
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
  }
  if (action === "deposit") {
    userState[ctx.from.id] = { awaitingDeposit: true };
    await ctx.reply("Введите сумму депозита:");
    await ctx.answerCallbackQuery();
    return;
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
        session.city, // Город пользователя
        session.studio // Студия пользователя
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
    const str2 = JSON.parse(str);

    // Генерация ссылки на оплату и получение paymentId
    const { paymentLink, paymentId } = await generatePaymentLinkForStudio(
      session.studio,
      session.email
    );

    await ctx.reply(
      `Отлично! Вы выбрали: ${buttonText}Для подтверждения записи оплатите, пожалуйста, тренировку по ссылке ниже. После оплаты вы получите сообщение с подтверждением записи.`
    );
    await ctx.reply(`Для оплаты перейдите по ссылке: ${paymentLink}`);
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
      str2,
      ctx.from.username
    );
  } else if (action.startsWith("later")) {
    await ctx.reply(
      `Пожалуйста, укажите ориентировочную дату тренировки в формате дд.мм\n\nЗа два дня до этой даты я вышлю актуальное расписание для выбора дня.`
    );

    // Сохраняем статус ожидания даты
    session.step = "awaiting_later_date";
    await session.save();
  } else if (action.startsWith("a_da")) {
    try {
      const tgId = ctx.from.id;
      const userInfo = await getUserInfo(tgId);
      const session = await Session.findOne({ userId: tgId.toString() });
      if (userInfo) {
        const { tag, currency } = userInfo;
        const keyboard = generateKeyboard(tag);
        if (keyboard) {
          await ctx.reply(
            "Рад слышать! Чтобы записаться на следующую тренировку, пожалуйста, выберите и оплатите подходящий тариф из списка ниже:",
            {
              reply_markup: keyboard,
            }
          );
        } else {
          await ctx.reply(
            "Ваш тег не распознан. Пожалуйста, обратитесь к поддержке."
          );
        }
        // Сохраняем информацию о выборе тарифа в сессии
        session.selectedTag = tag;
        session.currency = currency;
        await session.save(); // Сохраняем обновленную сессию
      }
    } catch (error) {
      console.error("Произошла ошибка:", error);
    }
  } else if (action.startsWith("buy")) {
    // Генерация ссылки для оплаты
    const actionInfo = actionData[action];
    const { paymentLink, paymentId } = await generateSecondPaymentLinkForStudio(
      action,
      session.email
    );

    // Отправляем пользователю ссылку на оплату
    await ctx.reply(`Для оплаты перейдите по ссылке: ${paymentLink}`);

    await thirdTwoToAirtable(
      ctx.from.id,
      paymentId,
      actionInfo.sum,
      actionInfo.lessons,
      actionInfo.tag
    );
  } else if (action.startsWith("a_net")) {
    await ctx.reply(`Ну жаль`);

    // Сохраняем статус ожидания даты
    session.step = "awaiting_later_date";
    await session.save();
  }
});

// Обработчик для нажатий обычных кнопок
bot.on("message:text", async (ctx) => {
  const session = await Session.findOne({ userId: ctx.from.id.toString() });
  const userMessage = ctx.message.text;
  const tgId = ctx.from.id;

  // Обработка кнопок для студий
  if (userMessage === "Записаться на тренировку") {
    // Удаляем стационарное меню
    await ctx.reply("Пожалуйста, введите ваше ФИО:", {
      reply_markup: {
        remove_keyboard: true, // Удаляет текущее стационарное меню
      },
    });

    // Устанавливаем этап в сессии
    session.step = "awaiting_name";
    await session.save(); // Сохраняем состояние сессии
  } else if (userState[tgId] && userState[tgId].awaitingDeposit) {
    const text = ctx.message.text.trim().toLowerCase();
    const sum = parseFloat(text);
    if (isNaN(sum) || sum <= 0) {
      await ctx.reply("Пожалуйста, введите корректную сумму.");
      return;
    }
    // Получаем информацию о пользователе
    const userInfo = await getUserInfo(tgId);
    if (!userInfo) {
      await ctx.reply("Не удалось получить информацию о пользователе.");
      return;
    }

    const paymentId = generateUniqueId();
    const paymentLink = generatePaymentLink(paymentId, sum, userInfo.email);
    await ctx.reply(`Отлично! Перейдите по ссылке для оплаты: ${paymentLink}`);

    // Отправляем данные о депозите в Airtable
    await sendTwoToAirtable(
      tgId,
      paymentId,
      sum,
      0,
      "deposit",
      0,
      ctx.from.username
    );

    // Сбрасываем состояние пользователя
    delete userState[tgId];
    return;
  }

  // Если сообщение начинается с '/', это команда, и мы её обрабатываем отдельно
  else if (userMessage.startsWith("/")) {
    switch (text) {
      case "/group":
        console.log("Переключил на /group");
        await ctx.reply("Переключено на групповые тренировки.", {
          reply_markup: {
            keyboard: new Keyboard()
              .text("Узнать баланс")
              .text("Купить групповые тренировки")
              .build(),
            resize_keyboard: true,
          },
        });
        break;
      case "/personal":
        console.log("Переключил на /personal");
        await ctx.reply("Переключено на персональные тренировки.", {
          reply_markup: {
            keyboard: new Keyboard()
              .text("Узнать баланс")
              .text("Купить персональные тренировки")
              .build(),
            resize_keyboard: true,
          },
        });
        break;
      case "/online":
        console.log("Переключил на /online");
        await ctx.reply("Переключено на онлайн тренировки.", {
          reply_markup: {
            keyboard: new Keyboard()
              .text("Узнать баланс")
              .text("Купить онлайн тренировки")
              .build(),
            resize_keyboard: true,
          },
        });
        break;
      case "/operator":
        console.log("Вызвал /operator");
        await ctx.reply(
          "Если у вас остались вопросы, вы можете написать нашему менеджеру Никите: @IDC_Manager, он подскажет 😉"
        );
        break;
      default:
        await ctx.reply("Неизвестная команда. Попробуйте снова.");
    }
    return; // Завершаем обработку, чтобы не продолжать ниже
  }

  // Обработчик для кнопки "Купить тренировки"
  if (userMessage === "купить групповые тренировки") {
    // const tgId = ctx.from.id;
    const userInfo = await getUserInfo(tgId);
    console.log("Нажал купить групповые тренировки");

    if (userInfo) {
      const newString = userInfo.tag
        .replace("personal", "group")
        .replace("ds", "dd");
      const keyboard = generateKeyboard(newString);
      if (keyboard) {
        await ctx.reply("Выберите тариф:", {
          reply_markup: keyboard,
        });
      } else {
        await ctx.reply(
          "Ваш тег не распознан. Пожалуйста, обратитесь к поддержке."
        );
      }
    } else {
      await ctx.reply(
        "Не удалось получить информацию о вашем теге. Пожалуйста, попробуйте позже."
      );
    }
  } else if (userMessage === "купить персональные тренировки") {
    const tgId = ctx.from.id;
    const userInfo = await getUserInfo(tgId);
    console.log("нажал купить персональные тренировки");
    if (userInfo) {
      const newString = userInfo.tag
        .replace("group", "personal")
        .replace("ds", "dd");
      const keyboard = generateKeyboard(newString);
      if (keyboard) {
        await ctx.reply("Выберите тариф:", {
          reply_markup: keyboard,
        });
      } else {
        await ctx.reply(
          "Ваш тег не распознан. Пожалуйста, обратитесь к поддержке."
        );
      }
    } else {
      await ctx.reply(
        "Не удалось получить информацию о вашем теге. Пожалуйста, попробуйте позже."
      );
    }
  } else if (userMessage === "купить онлайн тренировки") {
    const tgId = ctx.from.id;
    const userInfo = await getUserInfo(tgId);
    console.log("нажал купить онлайн тренировки");

    if (userInfo.tag === "ds_dasha_eur") {
      const keyboard = generateKeyboard(userInfo.tag);
      if (keyboard) {
        await ctx.reply("Выберите тариф:", {
          reply_markup: keyboard,
        });
      } else {
        await ctx.reply(
          "Ваш тег не распознан. Пожалуйста, обратитесь к поддержке @IDC_Manager."
        );
      }
    } else if (!userInfo.tag.includes("ds_dasha_eur")) {
      const newString = userInfo.tag.replace(userInfo.tag, "ds_dasha_rub");
      const keyboard = generateKeyboard(newString);
      if (keyboard) {
        await ctx.reply("Выберите тариф:", {
          reply_markup: keyboard,
        });
      } else {
        await ctx.reply(
          "Ваш тег не распознан. Пожалуйста, обратитесь к поддержке @IDC_Manager."
        );
      }
    } else {
      await ctx.reply(
        "Не удалось получить информацию о вашем теге. Пожалуйста, попробуйте позже."
      );
    }
  } else if (userMessage === "узнать баланс") {
    console.log("Нажал кнопку Узнать баланс");
    const tgId = ctx.from.id;
    const result = await getUserInfo(tgId);

    if (result !== null) {
      await ctx.reply(
        `Ваш текущий баланс: ${result.balance} ${result.currency}`
      );
    } else {
      await ctx.reply(
        "Не удалось получить информацию о балансе. Пожалуйста, попробуйте позже."
      );
    }
  } else if (userMessage === "Как проходят тренировки") {
    await ctx.reply(
      "У нас не обычные групповые тренировки, где все ученики делают одинаковые задания — у нас персональный подход.\n\nНа первом занятии тренер определит ваш уровень физической подготовки и обсудит основные цели. После этого все тренировки будут написаны с учетом вашего уровня и целей 🔥\n\nМы это делаем с помощью мобильного приложения, где у вас будет свой личный кабинет, история тренировок и результаты❗️\n\nТак мы добиваемся наиболее эффективного подхода для наших учеников 🤍"
    );
  } else if (userMessage === "Цены и расписание") {
    const priceAndSchedule = getPriceAndSchedule(session.studio);
    await ctx.reply(priceAndSchedule);
  } else if (userMessage === "Назад") {
    // Удаляем стационарное меню
    await ctx.reply("..", {
      reply_markup: { remove_keyboard: true },
    });
    // Возвращаем клавиатуру для выбора студии в зависимости от города
    let studiosKeyboard;

    if (session.city === "Москва") {
      studiosKeyboard = new InlineKeyboard()
        .add({ text: "м. 1905г.", callback_data: "studio_ycg" })
        .row()
        .add({ text: "Поменять город", callback_data: "change_city" });
    } else if (session.city === "Санкт-Петербург") {
      studiosKeyboard = new InlineKeyboard()
        .add({ text: "м. Петроградкая", callback_data: "studio_rtc" })
        .row()
        .add({ text: "м. Выборгская", callback_data: "studio_hkc" })
        .row()
        .add({
          text: "м. Московские Ворота",
          callback_data: "studio_spi",
        })
        .row()
        .add({ text: "Поменять город", callback_data: "change_city" });
    } else if (session.city === "Ереван") {
      studiosKeyboard = new InlineKeyboard()
        .add({ text: "ул. Бузанда", callback_data: "studio_gof" })
        .row()
        .add({ text: "Поменять город", callback_data: "change_city" });
    }

    // Отправляем сообщение с выбором студии
    await ctx.reply("Выберите студию или поменяйте город:", {
      reply_markup: studiosKeyboard,
    });
  } else if (userMessage === "FAQ") {
    console.log("нажал кнопку FAQ");
    await ctx.reply(
      "По ссылке ниже вы найдете ответы на часто задаваемые вопросы о наших тренировках. \n\nКому подходят такие тренировки, есть ли противопоказания, сколько длятся занятия, как приобрести подарочный сертификат и другие вопросы. \n\nЕсли вы не нашли ответ на свой вопрос, напишите нашему менеджеру Никите @IDC_Manager. ↘️",
      {
        reply_markup: new InlineKeyboard().url(
          "Читать FAQ",
          "https://telegra.ph/I-Do-Calisthenics-FAQ-02-06"
        ),
      }
    );
  } else if (session.step === "awaiting_later_date") {
    const userMessage = ctx.message.text;

    // Проверяем формат даты (дд.мм)
    const dateRegex = /^(0[1-9]|[12][0-9]|3[01])\.(0[1-9]|1[0-2])$/;
    if (dateRegex.test(userMessage)) {
      const [day, month] = userMessage.split(".");
      const year = new Date().getFullYear();
      const date = new Date(year, month - 1, day);

      // Проверяем, что дата в будущем
      const currentDate = new Date();
      currentDate.setHours(0, 0, 0, 0); // Устанавливаем время текущей даты в полночь

      if (date >= currentDate) {
        // Если дата в будущем, продолжаем сценарий
        const reminderDate = new Date(date);
        reminderDate.setDate(reminderDate.getDate() - 2);
        reminderDate.setHours(12, 30, 0, 0); // Устанавливаем фиксированное время

        const userTimezoneOffset = +3; // Пример: для Москвы установлено +3
        const reminderTimeUTC =
          reminderDate.getTime() - userTimezoneOffset * 60 * 60 * 1000;

        session.laterDate = userMessage;
        await session.save();

        const currentTime = Date.now();
        const reminderDelay = reminderTimeUTC - currentTime;

        await ctx.reply(
          `Вы выбрали ${userMessage}. Я свяжусь с вами за два дня до этой даты! \n\nЕсли у вас возникнут вопросы, вы всегда можете обратиться к нашему менеджеру Никите: @IDC_Manager`
        );

        if (reminderDelay > 0) {
          setTimeout(async () => {
            await ctx.reply(
              `Напоминаю, что вы запланировали тренировку на ${userMessage}. Выберите точную дату занятия:`
            );

            const studio = session.studio;
            const telegramId = ctx.from.id;

            // Отправляем данные на вебхук
            await sendToWebhook(studio, telegramId);

            session.step = "awaiting_next_step";
            await session.save();
          }, reminderDelay);
        }

        session.step = "completed";
        await session.save();
      } else {
        // Если дата прошедшая, повторяем запрос
        await ctx.reply(
          "Указанная дата уже прошла. Пожалуйста, выберите дату в будущем."
        );
        // Оставляем состояние "awaiting_later_date"
        session.step = "awaiting_later_date";
        await session.save();
      }
    } else {
      // Если формат неверный, повторяем запрос
      await ctx.reply(
        "Неправильный формат даты. Пожалуйста, используйте формат дд.мм (например, 04.12)."
      );
      // Оставляем состояние "awaiting_later_date"
      session.step = "awaiting_later_date";
      await session.save();
    }
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

// Функция для обработки сценария, если пользователь уже есть в базе
async function handleExistingUserScenario(ctx) {
  try {
    const userInfo = await getUserInfo(ctx.from.id);
    if (userInfo) {
      const { tag } = userInfo;

      if (tag.includes("ds")) {
        console.log("получил кнопки меню (ds)");
        const keyboard = new Keyboard()
          .text("Узнать баланс")
          .text("Купить онлайн тренировки");
        await ctx.reply("Привет! Выберите, что вас интересует:", {
          reply_markup: { keyboard: keyboard.build(), resize_keyboard: true },
        });
      } else if (tag.includes("group")) {
        console.log("получил кнопки меню (group)");
        const keyboard = new Keyboard()
          .text("Узнать баланс")
          .text("Купить групповые тренировки");
        await ctx.reply("Привет! Выберите, что вас интересует:", {
          reply_markup: { keyboard: keyboard.build(), resize_keyboard: true },
        });
      } else if (tag.includes("personal")) {
        console.log("получил кнопки меню (personal)");
        const keyboard = new Keyboard()
          .text("Узнать баланс")
          .text("Купить персональные тренировки");
        await ctx.reply("Привет! Выберите, что вас интересует:", {
          reply_markup: { keyboard: keyboard.build(), resize_keyboard: true },
        });
      }
    }
  } catch (error) {
    console.error("Произошла ошибка:", error);
  }
}

// Запуск бота
bot.start();
