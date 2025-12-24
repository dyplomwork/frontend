# Casino Simulator (Demo) — Vue 3 + Vite


## Запуск
```bash
npm install
npm run dev
```

## Роли и вход (демо)
- User: `user@example.com` / `user`
- Admin: `admin@example.com` / `admin`

## Страницы
- `/` — главная
- `/login` — вход
- `/games` — выбор режима
- `/games/roulette` — рулетка 5×5 (линии: строки/колонки/диагонали)
- `/games/mines` — Mineswapper (риск-игра с минами)
- `/cases` — список кейсов
- `/cases/:id` — страница кейса (анимация + таблица лута)
- `/profile` — профиль пользователя (баланс + создание тикетов)
- `/admin` — админка (тикеты + изменение баланса пользователей)

## Скрипты
- `npm run dev` — запуск
- `npm run build` — сборка
- `npm run preview` — предпросмотр

## Auth
- `/login` — вход по никнейму или Discord
- `/register` — регистрация (nickname, discord, password; хранение в LocalStorage)

## Server persistence
Accounts are stored on disk in `server/db/users.json` (on the PC where the project is running). API runs on `http://localhost:3001` and Vite proxies `/api/*` to it.

Admin account:
- nickname: `SHARA`
- discord: `SHARA`
- password: `SHARA`

Run:
```bash
npm install
npm run dev
```

### Debug HTTP 500
If you see **HTTP 500**, open the terminal where `api` is running — the server prints the exact error stack. Also verify `/api/health` returns `{ ok: true }`.
