import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { api, ApiError } from './apiClient'

// Mock localStorage (storage module)
vi.mock('../auth/storage', () => ({
  canUseStorage: () => true,
  getToken: () => 'mock-jwt-token',
}))

// Mock config
vi.mock('../config/env', () => ({
  getApiBaseUrl: () => '',
}))

describe('ApiError', () => {
  it('є екземпляром Error', () => {
    const err = new ApiError(404, 'Not found')
    expect(err).toBeInstanceOf(Error)
    expect(err.status).toBe(404)
    expect(err.message).toBe('Not found')
  })

  it('зберігає data', () => {
    const data = { detail: 'some detail' }
    const err = new ApiError(422, 'Validation error', data)
    expect(err.data).toEqual(data)
  })
})

describe('api() — Integration з fetch mock', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.stubGlobal('window', {
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('успішно повертає JSON для 200 OK', async () => {
    const mockData = { ok: true, token: 'abc123' }
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mockData), { status: 200 }))

    const result = await api<typeof mockData>('/api/test')
    expect(result).toEqual(mockData)
  })

  it('додає Bearer токен у заголовок Authorization', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 200 }))

    await api('/api/protected')

    const callArgs = vi.mocked(fetch).mock.calls[0]
    const headers = (callArgs[1] as RequestInit).headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer mock-jwt-token')
  })

  it('викидає ApiError для відповіді 401', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    )

    await expect(api('/api/secure')).rejects.toThrow(ApiError)

    try {
      await api('/api/secure-2')
    } catch (e) {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
      )
    }
  })

  it('встановлює Content-Type для JSON body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 200 }))

    await api('/api/data', { method: 'POST', body: { key: 'value' }, json: true })

    const headers = (vi.mocked(fetch).mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers['Content-Type']).toContain('application/json')
  })

  it('викидає ApiError з Network error при збої мережі', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Network failure'))

    await expect(api('/api/broken')).rejects.toThrow('Network error')
  })
})
