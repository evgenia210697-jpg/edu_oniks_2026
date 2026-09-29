// Первичное наполнение: администратор + демонстрационный курс
const crypto = require('crypto');
const { db, tx } = require('./db');
const config = require('./config');
const auth = require('./auth');

const id = () => crypto.randomUUID().slice(0, 8);
const b = (type, data) => ({ id: id(), type, data });

function demoCourse() {
  const lecturePages = [
    {
      id: id(),
      blocks: [
        b('text', { html: '<h2>Добро пожаловать!</h2><p>Это <strong>демонстрационный курс</strong>. Он показывает, какие блоки можно использовать в уроках. Отредактируйте его или удалите, когда создадите свои курсы.</p>' }),
        b('callout', { variant: 'goal', title: 'Цель урока', html: '<p>Познакомиться с интерфейсом платформы и видами материалов.</p>' }),
        b('text', { html: '<h3>Что умеет редактор</h3><ul><li><p>текст с форматированием, списками и ссылками;</p></li><li><p>видео и аудио, загруженные на ваш сервер;</p></li><li><p>презентации в PDF с листанием по страницам;</p></li><li><p>файлы для скачивания, таблицы, спойлеры, кнопки и многое другое.</p></li></ul>' }),
        b('table', { header: true, rows: [['Термин', 'Значение'], ['Модуль', 'Раздел курса, объединяет несколько занятий'], ['Занятие', 'Урок, задание или тест'], ['Куратор', 'Сотрудник, который проверяет задания']] }),
        b('callout', { variant: 'warning', title: 'Совет', html: '<p>Большие видео лучше загружать в формате MP4 (H.264) — так они будут воспроизводиться в любом браузере.</p>' }),
      ],
    },
    {
      id: id(),
      blocks: [
        b('text', { html: '<h2>Страница 2</h2><p>Урок можно разбить на несколько страниц — ученик листает их кнопками «Назад» и «Далее».</p>' }),
        b('spoiler', { title: 'Нажмите, чтобы раскрыть спойлер', html: '<p>Спойлеры удобны для подсказок и ответов на вопросы для самопроверки.</p>' }),
        b('checklist', { items: [{ id: id(), text: 'Прочитал(а) первую страницу' }, { id: id(), text: 'Посмотрел(а) таблицу' }, { id: id(), text: 'Открыл(а) спойлер' }] }),
        b('divider', { style: 'solid' }),
        b('quote', { html: '<p>Учиться никогда не поздно.</p>', author: 'Народная мудрость' }),
      ],
    },
  ];
  const questions = [
    { id: id(), type: 'choice', text: 'Из чего состоит курс на платформе?', explanation: 'Курс делится на модули, а модули — на занятия.',
      options: [{ id: id(), text: 'Из модулей и занятий', correct: true }, { id: id(), text: 'Только из видео', correct: false }, { id: id(), text: 'Из одного длинного текста', correct: false }] },
    { id: id(), type: 'choice', text: 'Какие типы занятий есть на платформе? (несколько ответов)', explanation: '',
      options: [{ id: id(), text: 'Урок', correct: true }, { id: id(), text: 'Задание', correct: true }, { id: id(), text: 'Тест', correct: true }, { id: id(), text: 'Вебинар', correct: false }] },
    { id: id(), type: 'gaps', text: 'Заполните пропуски', gapText: 'Задания проверяет [куратор], а тесты проверяются [автоматически].', distractors: ['бухгалтер', 'вручную'], explanation: '' },
    { id: id(), type: 'match', text: 'Сопоставьте термин и определение', explanation: '',
      pairs: [{ id: id(), left: 'Модуль', right: 'Раздел курса' }, { id: id(), left: 'Тест', right: 'Проверка знаний с автопроверкой' }, { id: id(), left: 'Задание', right: 'Работа, которую проверяет куратор' }] },
    { id: id(), type: 'order', text: 'Расставьте шаги в правильном порядке', explanation: '',
      items: [{ id: id(), text: 'Открыть курс' }, { id: id(), text: 'Изучить урок' }, { id: id(), text: 'Пройти тест' }] },
    { id: id(), type: 'text', text: 'Как называется раздел курса, который объединяет несколько занятий?', answers: ['модуль'], caseSensitive: false, explanation: '' },
    { id: id(), type: 'number', text: 'Сколько типов занятий есть на платформе?', answers: [3], integerOnly: true, explanation: 'Урок, задание и тест.' },
  ];
  const assignmentPages = [{
    id: id(),
    blocks: [
      b('text', { html: '<h2>Практическое задание</h2><p>Напишите в ответе, какой курс вы хотели бы пройти первым и почему. Можно прикрепить файл или записать аудио.</p>' }),
      b('callout', { variant: 'info', title: 'Как сдать', html: '<p>Заполните поле ответа внизу страницы и нажмите «Отправить на проверку». Куратор проверит работу и оставит комментарий.</p>' }),
    ],
  }];
  return { lecturePages, questions, assignmentPages };
}

function seedIfEmpty() {
  const n = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (n > 0) return;
  tx(() => {
    const adminId = db.prepare("INSERT INTO users (email, name, password_hash, role, position) VALUES (?, ?, ?, 'admin', 'Администратор платформы')")
      .run(config.ADMIN_EMAIL.toLowerCase(), 'Администратор', auth.hashPassword(config.ADMIN_PASSWORD)).lastInsertRowid;
    if (process.env.SEED_DEMO === 'false') return;
    const { lecturePages, questions, assignmentPages } = demoCourse();
    const cid = db.prepare("INSERT INTO courses (title, description, status, sort) VALUES (?, ?, 'published', 1)")
      .run('Как пользоваться платформой (пример)', 'Демонстрационный курс: все виды материалов, тест и задание').lastInsertRowid;
    const mid = db.prepare('INSERT INTO modules (course_id, title, sort) VALUES (?, ?, 1)').run(cid, 'Знакомство с платформой').lastInsertRowid;
    const add = (type, title, sort, settings, content) => {
      const c = JSON.stringify(content);
      db.prepare(`INSERT INTO lessons (course_id, module_id, type, title, status, sort, settings, draft, published, published_at)
        VALUES (?, ?, ?, ?, 'published', ?, ?, ?, ?, datetime('now'))`).run(cid, mid, type, title, sort, JSON.stringify(settings), c, c);
    };
    add('lecture', 'Как устроены уроки', 1, { points: 5 }, { pages: lecturePages });
    add('test', 'Проверка знаний', 2, { points: 10, passPercent: 60, showAnswers: 'all', attemptsLimit: 0, timeLimitMin: 0, shuffleQuestions: false, shuffleOptions: true, bankCount: 0 },
      { intro: [b('text', { html: '<p>Небольшой тест из 7 вопросов разных типов. Для прохождения нужно 60% правильных ответов.</p>' })], questions });
    add('assignment', 'Практическое задание', 3, { maxPoints: 10, deadlineDays: 0, closeAfterDeadline: false, reviewerId: null, autoAccept: false }, { pages: assignmentPages });
    const sid = db.prepare("INSERT INTO users (email, name, password_hash, role, position, department) VALUES (?, ?, ?, 'student', ?, ?)")
      .run('student@company.local', 'Тестовый ученик', auth.hashPassword('student12345'), 'Менеджер', 'Отдел продаж').lastInsertRowid;
    db.prepare('INSERT INTO enrollments (user_id, course_id) VALUES (?, ?)').run(sid, cid);
  });
  console.log(`\n  Создан администратор: ${config.ADMIN_EMAIL} / пароль из .env (ADMIN_PASSWORD)`);
}

module.exports = { seedIfEmpty };
