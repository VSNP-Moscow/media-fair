# Развёртывание на Cloud.ru (VM с «Навигатором»)

API и MySQL живут рядом с проектом «Навигатор педагога», но полностью изолированно:
свой каталог, свой Docker-проект, свой порт, свой хост в Caddy, своя база.

## Что где лежит

| Компонент | Расположение |
|---|---|
| Код API | `/opt/media-fair` (владелец `navigator`) |
| Секреты | `/opt/media-fair/.env` (chmod 600) |
| MySQL | контейнер `media-fair-db`, том `media-fair_mf_db`, порт наружу не открыт |
| API | контейнер `media-fair-api`, слушает `127.0.0.1:4010` |
| Публичный адрес | `https://mf.176.109.108.39.sslip.io` (Caddy → 4010) |
| Табло/фронтенд | GitHub Pages, адрес API в `config.js` |

Порт 4000, контейнер `navigator-app` и сайт `176.109.108.39.sslip.io` не затрагиваются.

## Обновление кода

С локальной машины:

```powershell
python PRIVATE-DEPLOY\deploy_media_fair.py   # заливает server/ в /opt/media-fair
```

На сервере:

```bash
cd /opt/media-fair
sudo docker compose --env-file .env up -d --build
sudo docker compose --env-file .env ps
curl -s http://127.0.0.1:4010/api/health
```

## .env

```dotenv
NODE_ENV=production
DB_NAME=media_fair
DB_USER=mf_app
DB_PASSWORD=<24+ символов>
DB_ROOT_PASSWORD=<24+ символов>
JWT_SECRET=<48+ символов, openssl rand -hex 48>
CORS_ORIGINS=https://vsnp-moscow.github.io,http://localhost:8080
BIND_ADDR=127.0.0.1
BIND_PORT=4010
TRUST_PROXY=true
```

`CORS_ORIGINS` — точный список Origin, которым разрешены запросы к API. После смены
домена GitHub Pages (или переезда на свой домен) список нужно обновить и перезапустить API.

## Caddy

В `/home/navigator/app/deploy/Caddyfile.vm` добавлен отдельный блок:

```caddy
mf.176.109.108.39.sslip.io {
    encode zstd gzip
    reverse_proxy 127.0.0.1:4010
    header {
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
        -Server
    }
}
```

Применение:

```bash
docker exec navigator-proxy caddy validate --config /etc/caddy/Caddyfile
docker exec navigator-proxy caddy reload   --config /etc/caddy/Caddyfile
```

Резервные копии Caddyfile — `Caddyfile.vm.bak.*` в том же каталоге.

## Первый запуск

1. Открыть сайт, форма «Создать первого администратора» появляется, пока таблица `users` пуста.
2. Создать администратора → он сразу попадает в панель.
3. Добавить команды: пользователи-участники с одинаковым названием команды суммируются в табло.
4. Создать задания (станции с координатами, викторина, игра).
5. Открыть `dashboard.html` на проекторе.

## Резервная копия и восстановление

```bash
# дамп
sudo docker exec media-fair-db sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction media_fair' > media_fair-$(date +%F).sql

# восстановление
sudo docker exec -i media-fair-db sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" media_fair' < media_fair-2026-10-28.sql
```

Дампы содержат персональные данные (логины, хэши паролей) — хранить приватно.

Ежедневный бэкап (cron, 03:10):

```cron
10 3 * * * cd /opt/media-fair && sudo /usr/bin/docker exec media-fair-db sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction media_fair' | gzip > /home/navigator/backups/media_fair-$(date +\%F).sql.gz
```

## Диагностика

```bash
cd /opt/media-fair
sudo docker compose --env-file .env ps
sudo docker compose --env-file .env logs -f api
sudo docker compose --env-file .env logs -f db
sudo tail -50 /var/log/caddy/*.log 2>/dev/null || sudo docker logs --tail 50 navigator-proxy
```

Частые причины:

- `503 database down` — MySQL ещё стартует или кончилось место на диске (`df -h /`).
- `403 Источник запроса не разрешён` — Origin сайта не совпадает с `CORS_ORIGINS`.
- `401 Сессия истекла` — истёк токен (12 часов) или сменился `JWT_SECRET`.
- Табло пустое — нет участников-участников с командой (роль `participant`).

## Ограничения

- VM: 1 vCPU / 1 ГБ RAM, добавлен swap 1 ГБ. MySQL ограничен 340 МБ, API — 224 МБ.
  Для мероприятия на несколько десятков одновременных пользователей достаточно.
- HTTPS для API обязателен: GitHub Pages работает по HTTPS, браузер заблокирует
  запросы к `http://`.
- Данные одного мероприятия живут в одной базе. Для нового мероприятия удобнее очистить
  таблицы `awards`, `quiz_attempts`, `game_best` и пользователей-участников, сохранив админа.
