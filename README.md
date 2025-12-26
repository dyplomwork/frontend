# Casino Simulator (Frontend) — Vue 3 + Vite


## Запуск
```bash
npm install
npm run dev
```

## API домен
Фронт использует `VITE_API_BASE_URL` (см. `.env.example`).
Для продакшена нужно, чтобы запросы шли на:
- `https://api.scxdrop.online`

Пример `.env`:
```bash
VITE_API_BASE_URL=https://api.scxdrop.online
```

## Фоновая музыка
Положи файл музыки в:
- `public/audio/bgm.mp3`

Музыка тихая и включена по умолчанию, но браузер может потребовать первый клик/нажатие клавиши для старта.


## Страницы
- `/` — главная
- `/login` — вход
- `/plinko` — Plinko
- `/roulette` — Roulette
- `/cases` — Cases
- `/admin` — админка (если backend разрешает)
