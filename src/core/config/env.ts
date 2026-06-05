export function getEnv(key: string, fallback = ''): string {
  return ((import.meta as any)?.env?.[key] as string | undefined) ?? fallback
}

export function getApiBaseUrl(): string {
  const v = (getEnv('VITE_MOCK_API') || '').toLowerCase()
  const mock = v === '1' || v === 'true' || v === 'yes' || v === 'on'
  if (mock) return ''
  return getEnv('VITE_API_BASE_URL') || 'http://localhost'
}
