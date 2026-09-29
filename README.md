# Платформа обучения сотрудников

Собственная замена Skillspace для внутреннего обучения: курсы, уроки с видео/аудио/PDF/файлами, тесты с автопроверкой, задания с проверкой куратором, личный кабинет, статистика. Работает на вашем сервере, данные никуда не уходят.

- **Сервер:** Node.js 22 LTS или новее (минимум 22.13), база — встроенный в Node.js SQLite: отдельный сервер БД не нужен, ничего не компилируется.
- **Зависимости уже в комплекте** (папка `node_modules`) — интернет на сервере не нужен.
- **Интерфейс:** уже собран и лежит в `client/dist` — пересобирать не нужно.
- **Данные:** всё хранится в папке `data/` (база `lms.sqlite` + загруженные файлы `uploads/`).

---

## 1. Быстрый запуск (Windows или Linux)

1. Установите Node.js 22 LTS (или 24 LTS): https://nodejs.org (на Windows — установщик .msi, галочки по умолчанию).
2. Скопируйте папку платформы на сервер, например `C:\lms` или `/opt/lms`.
3. Скопируйте `.env.example` в `.env` и поменяйте как минимум `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `APP_URL`.
4. В папке платформы выполните:

```bash
npm start              # запуск (зависимости уже в папке node_modules)
```

   На Windows можно просто запустить `start-windows.bat`, на Linux — `./start-linux.sh`.

5. Откройте в браузере `http://IP-сервера:8080` и войдите под `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

> При первом запуске создаются администратор, демонстрационный курс и тестовый ученик `student@company.local` / `student12345`. Удалите их после знакомства (или поставьте `SEED_DEMO=false` до первого запуска).

Откройте порт 8080 во входящих правилах брандмауэра сервера, чтобы сотрудники могли зайти с рабочих компьютеров.

## 2. Запуск как службы (чтобы работало после перезагрузки)

**Windows** — через [NSSM](https://nssm.cc):

```bat
nssm install LMS "C:\Program Files\nodejs\node.exe" "C:\lms\server\index.js"
nssm set LMS AppDirectory C:\lms
nssm start LMS
```

**Linux (systemd)** — файл `/etc/systemd/system/lms.service`:

```ini
[Unit]
Description=LMS platform
After=network.target

[Service]
WorkingDirectory=/opt/lms
ExecStart=/usr/bin/node server/index.js
Restart=always
User=lms

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now lms
```

**Docker** (альтернатива): `docker compose up -d --build` — данные будут в `./data` рядом с `docker-compose.yml`.

## 3. HTTPS и доменное имя (рекомендуется)

Для внутренней сети достаточно `http://IP:8080`. Если нужен адрес вида `https://learn.company.ru` (обязательно, если платформа будет доступна из интернета), поставьте перед платформой nginx:

```nginx
server {
    listen 443 ssl;
    server_name learn.company.ru;
    ssl_certificate     /etc/ssl/learn.crt;
    ssl_certificate_key /etc/ssl/learn.key;

    client_max_body_size 4g;          # загрузка больших видео
    proxy_request_buffering off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

После этого в `.env`: `COOKIE_SECURE=true`, `APP_URL=https://learn.company.ru`, и можно слушать только localhost: `HOST=127.0.0.1`.

Запись аудиоответов прямо из браузера работает только по HTTPS (или на самом сервере через localhost) — это ограничение браузеров. Прикреплять готовые аудиофайлы можно и по http.

## 4. Почта (необязательно)

Без настроек уведомления показываются внутри платформы (колокольчик). Чтобы дублировать их на email, заполните в `.env` блок `SMTP_*` (адрес почтового сервера, порт, логин, пароль, отправитель) и перезапустите платформу. Статус видно в «Настройках» админки.

## 5. Резервные копии

```bash
npm run backup
```

Создаёт папку `backups/backup-ДАТА` с копией базы и всех файлов (безопасно делать на работающей платформе). Добавьте команду в планировщик (Windows Task Scheduler / cron) — например, каждую ночь — и копируйте папку `backups` на другой диск.

Восстановление: остановить платформу → заменить `data/lms.sqlite` и `data/uploads` файлами из бэкапа → запустить.

## 6. Служебные команды

| Команда | Что делает |
|---|---|
| `npm run set-password -- email@company.ru НовыйПароль` | Задать пароль любому пользователю (если админ забыл свой) |
| `npm run create-admin -- email@company.ru Пароль "Имя Фамилия"` | Создать ещё одного администратора |
| `npm run backup` | Резервная копия |

## 7. Обновление версии

1. `npm run backup`
2. Остановить службу.
3. Заменить папки `server`, `client/dist` и файлы `package*.json` новыми (папку `data` и файл `.env` не трогать).
4. Заменить папку `node_modules` новой, запустить службу.

## 8. Разработка (если нужно что-то доработать)

```bash
npm ci                 # все зависимости, включая сборщик
npm run dev:server     # сервер на :8080
npm run dev:client     # интерфейс с автообновлением на :5173
npm run build          # собрать интерфейс в client/dist
```

Структура: `server/` — API (Express + встроенный node:sqlite), `client/src/` — интерфейс (React). Основная логика прохождения и проверки тестов — `server/logic.js`.

## Требования к ресурсам

Для 50–100 сотрудников хватит 2 ядер, 2–4 ГБ ОЗУ. Место на диске зависит от видео: 1 час видео 720p ≈ 0,5–1 ГБ. Видео лучше загружать в MP4 (H.264) — такой формат играет во всех браузерах.
