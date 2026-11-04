'use strict';

const db = require('./db');

const stations = [
  {
    title: 'Прямой эфир',
    description: 'Выберите карточку темы о народном единстве и запишите включение на фоне хромакея: приветствие, подтверждённый факт, что произошло, где или когда, почему это важно и финальная фраза. Без выдумок и длинного вступления.',
  },
  {
    title: 'Фотоохота «Сокровища России»',
    aliases: ['Сокровища России'],
    description: 'Найдите по школе 5 карточек с предметами разных народов России и сделайте с ними фотографию команды. Карточки подготовят и разместят ответственные за станцию.',
  },
  {
    title: 'Медиапочта',
    description: 'Получите открытку с пожеланиями за подписку на каналы медиасовета и школы: https://max.ru/id7731173820_gos и https://vk.ru/ecole1248. Подпишите её другу или учителю либо заберите с собой; ответственные доставят открытки адресатам.',
  },
  {
    title: 'Фейк новости',
    description: 'Рассмотрите карточку с утверждением, изображением или заголовком и ссылкой на источник. Объясните минимум два признака надёжной или сомнительной информации и решите, что можно публиковать после проверки. Ведущий раскрывает ответы и показывает надёжные источники.',
  },
  {
    title: 'Народное радио',
    description: 'Вытяните карточку и прочитайте текст о Дне народного единства чётко и быстро за 30 секунд. Карточки подготовлены по уровням: 5, 6–7, 8–9, 10–11 классы.',
  },
  {
    title: 'Мастерская «Медиа ИИ»',
    aliases: ['Медиа ИИ'],
    description: 'По сценарию участник подписывается на страницу школы, проходит тест «Кем ты был в прошлом», фотографируется для обработки в Remini. Ответственные отправляют результат в облако и на печать; фотографию можно забрать в завершении. Тест и ответы в предоставленном PDF отсутствуют — материалы должен предоставить организатор.',
  },
  {
    title: 'Журнал Новая Эра',
    aliases: ['Журнал «Новая Эра»'],
    description: 'Станьте автором праздничного журнала «Новая Эра. Единство начинается с нас!». За 3–5 минут подготовьте заметку, ответ, предложение или рисунок для одной из пяти рубрик: «История объединяет», «Традиции рядом», «Голос нашей школы», «Вместе можем!», «Единство в рисунках». Передайте карточку редакторам для размещения на общем стенде.',
  },
];

function normalizedTitle(title) {
  return title.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е')
    .replace(/^\s*(?:станция\s*)?(?:\d+\s*[.)]?\s*)?(?:станция\s*)?/u, '')
    .replace(/[«»„“”"'‘’]/g, '').replace(/[–—-]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function seed() {
  return db.tx(async (conn) => {
    // The setting row also serializes concurrent manual runs of this seed.
    const [settings] = await conn.query("SELECT v FROM settings WHERE k = 'station_points' FOR UPDATE");
    const value = settings[0] && settings[0].v;
    const points = Number(value);
    if (value === undefined || !/^\d+$/.test(value) || !Number.isSafeInteger(points) || points > 10000) {
      throw new Error('station_points отсутствует или некорректен; сначала проверьте существующие настройки');
    }

    await conn.query("INSERT IGNORE INTO settings (k, v) VALUES ('survey_open', '0')");
    const [existing] = await conn.query('SELECT id, title, type FROM tasks FOR UPDATE');
    const messages = [];
    const createdAt = Date.now();

    for (let i = 0; i < stations.length; i += 1) {
      const station = stations[i];
      const id = 'scenario_station_' + (i + 1);
      const titles = [station.title, ...(station.aliases || [])].map(normalizedTitle);
      const match = existing.find((task) => task.type === 'station' && titles.includes(normalizedTitle(task.title)));
      if (match) {
        messages.push('Пропущено: ' + station.title + ' — уже есть станция ' + match.id);
        continue;
      }
      if (existing.some((task) => task.id === id)) {
        messages.push('Пропущено: ' + station.title + ' — ID ' + id + ' уже занят; существующее задание не изменено');
        continue;
      }
      await conn.query(
        `INSERT INTO tasks (id, title, description, type, points, lat, lng, created_by, created_at)
         VALUES (?, ?, ?, 'station', ?, NULL, NULL, NULL, ?)`,
        [id, station.title, station.description, points, createdAt + i]
      );
      existing.push({ id, title: station.title, type: 'station' });
      messages.push('Создано: ' + id + ' — ' + station.title + ' (' + points + ' баллов)');
    }
    return messages;
  });
}

async function main() {
  try {
    const messages = await seed();
    messages.forEach((message) => console.log('[seed-scenario] ' + message));
    console.log('[seed-scenario] Готово. Существующие задания и настройки не перезаписаны.');
  } finally {
    await db.pool.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[seed-scenario] Ошибка:', err.message);
    process.exitCode = 1;
  });
}

module.exports = { seed, normalizedTitle, stations };
