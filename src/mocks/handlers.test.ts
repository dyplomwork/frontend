import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { setupServer } from 'msw/node'
import { handlers } from './handlers'

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('mock handlers', () => {
  it('handles dice play requests in mock mode', async () => {
    const res = await fetch('http://localhost/api/v1/games/dice/game/play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bet: 100, rollOver: 50 }),
    })

    expect(res.ok).toBe(true)
    const json = await res.json()
    expect(json).toMatchObject({
      roll: expect.any(Number),
      isWin: expect.any(Boolean),
      payout: expect.any(Number),
    })
  })
})
