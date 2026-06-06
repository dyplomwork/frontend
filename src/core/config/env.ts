export function getEnv(key: string, fallback = ''): string {
  return ((import.meta as any)?.env?.[key] as string | undefined) ?? fallback
}

export function getApiBaseUrl(): string {
  const v = (getEnv('VITE_MOCK_API') || '').toLowerCase()
  const mock = v === '1' || v === 'true' || v === 'yes' || v === 'on'
  if (mock) return ''
  const configured = getEnv('VITE_API_BASE_URL')
  // In production (Vercel): VITE_API_BASE_URL is not set → same-origin requests,
  // Vercel rewrites proxy /api/* to the correct Railway service.
  // In development: falls back to http://localhost (Docker backend).
  if (configured) return configured
  return (import.meta as any).env?.DEV ? 'http://localhost' : ''
}
