import { describe, it, expect } from 'vitest'
import { normalizeError, userMessageForStatusI18n } from './errors'
import { ApiError } from '../core/http/apiClient'

describe('normalizeError', () => {
  it('обробляє ApiError з повідомленням', () => {
    const err = new ApiError(404, 'Not found')
    const result = normalizeError(err)
    expect(result.status).toBe(404)
    expect(result.message).toBe('Not found')
  })

  it('обробляє ApiError без повідомлення — будує з статусу', () => {
    const err = new ApiError(500, '')
    const result = normalizeError(err)
    expect(result.status).toBe(500)
    expect(result.message).toBe('HTTP 500')
  })

  it('обробляє plain Error', () => {
    const err = new Error('Something went wrong')
    const result = normalizeError(err)
    expect(result.status).toBe(0)
    expect(result.message).toBe('Something went wrong')
  })

  it('обробляє об\'єкт зі status та message', () => {
    const err = { status: 403, message: 'Forbidden' }
    const result = normalizeError(err)
    expect(result.status).toBe(403)
    expect(result.message).toBe('Forbidden')
  })

  it('обробляє рядкову помилку', () => {
    const result = normalizeError('unexpected error')
    expect(result.status).toBe(0)
    expect(result.message).toBe('unexpected error')
  })

  it('обробляє null/undefined', () => {
    expect(normalizeError(null).message).toBe('Error')
    expect(normalizeError(undefined).message).toBe('Error')
  })
})

describe('userMessageForStatusI18n', () => {
  const fallback = 'Default error'

  it('повертає повідомлення для 401 без t()', () => {
    expect(userMessageForStatusI18n(401, fallback)).toBe(fallback)
  })

  it('повертає повідомлення для 401 з t()', () => {
    const t = (key: string) => `translated:${key}`
    expect(userMessageForStatusI18n(401, fallback, t)).toBe('translated:ui.s_need_login')
  })

  it('повертає повідомлення для 403 з t()', () => {
    const t = (key: string) => `translated:${key}`
    expect(userMessageForStatusI18n(403, fallback, t)).toBe('translated:ui.s_forbidden')
  })

  it('повертає повідомлення для 429 з t()', () => {
    const t = (key: string) => `translated:${key}`
    expect(userMessageForStatusI18n(429, fallback, t)).toBe('translated:ui.s_too_many_requests')
  })

  it('повертає повідомлення для 500+ з t()', () => {
    const t = (key: string) => `translated:${key}`
    expect(userMessageForStatusI18n(503, fallback, t)).toBe('translated:ui.s_server_unavailable')
    expect(userMessageForStatusI18n(500, fallback, t)).toBe('translated:ui.s_server_unavailable')
  })

  it('повертає fallback для невідомого статусу', () => {
    const t = (key: string) => `translated:${key}`
    expect(userMessageForStatusI18n(400, fallback, t)).toBe(fallback)
    expect(userMessageForStatusI18n(200, fallback, t)).toBe(fallback)
  })
})
