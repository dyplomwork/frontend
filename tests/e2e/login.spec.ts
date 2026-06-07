import { test, expect } from '@playwright/test'

// E2E тести для сторінки авторизації SCXDROP
// URL: https://dyplomworkfrontend.vercel.app

test.describe('E2E Тестування: Авторизація користувача', () => {
  test('успішний логін та перехід на головну', async ({ page }) => {
    await page.goto('https://dyplomworkfrontend.vercel.app/login')

    // Ввід через pressSequentially — тригерить Vue v-model реактивність
    await page.locator('input[autocomplete="username"]').pressSequentially('testuser')
    await page.locator('input[autocomplete="current-password"]').pressSequentially('Test123!')

    // Кнопка Submit (активна після заповнення форми)
    await page.locator('button[type="submit"]').click()

    // Після логіну — редирект на /profile
    await expect(page).toHaveURL(/\/profile/, { timeout: 15000 })
  })

  test('показ помилки при неправильному паролі', async ({ page }) => {
    await page.goto('https://dyplomworkfrontend.vercel.app/login')

    await page.locator('input[autocomplete="username"]').pressSequentially('testuser')
    await page.locator('input[autocomplete="current-password"]').pressSequentially('WRONG_PASSWORD_12345')

    await page.locator('button[type="submit"]').click()

    // URL залишається /login (не переходить при помилці)
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
  })

  test('блокування доступу до /inventory без авторизації', async ({ page }) => {
    await page.goto('https://dyplomworkfrontend.vercel.app/inventory')

    // Має бути редирект на login
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('E2E Тестування: Реєстрація', () => {
  test('успішна реєстрація нового користувача', async ({ page }) => {
    const uniqueNick = `re2e${Date.now()}`

    await page.goto('https://dyplomworkfrontend.vercel.app/register')

    await page.locator('input[autocomplete="nickname"]').pressSequentially(uniqueNick)
    await page.locator('input[autocomplete="new-password"]').pressSequentially('Test1234!')

    await page.locator('button[type="submit"]').click()

    // Після реєстрації — редирект на /profile
    await expect(page).toHaveURL(/\/profile/, { timeout: 15000 })
  })

  test('реєстрація з уже зайнятим нікнеймом показує помилку', async ({ page }) => {
    await page.goto('https://dyplomworkfrontend.vercel.app/register')

    await page.locator('input[autocomplete="nickname"]').pressSequentially('testuser')
    await page.locator('input[autocomplete="new-password"]').pressSequentially('Test1234!')

    await page.locator('button[type="submit"]').click()

    // При помилці залишається на /register і з'являється .notice.error
    await expect(page.locator('.notice.error')).toBeVisible({ timeout: 10000 })
  })
})

test.describe('E2E Тестування: Навігація', () => {
  test('головна сторінка завантажується і показує ігри', async ({ page }) => {
    await page.goto('https://dyplomworkfrontend.vercel.app/')

    await expect(page).toHaveTitle(/scxdrop/i)
    // Навігаційні посилання на ігри мають бути присутні
    await expect(page.locator('a[href="/dice"], a[href="/roulette"], a[href="/mines"]').first()).toBeVisible()
  })

  test('перехід на сторінку Roulette', async ({ page }) => {
    await page.goto('https://dyplomworkfrontend.vercel.app/roulette')

    await expect(page).toHaveURL('https://dyplomworkfrontend.vercel.app/roulette')
    await expect(page.locator('body')).toBeVisible()
  })
})
