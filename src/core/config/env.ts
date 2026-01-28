export function getEnv(key: string, fallback = ''): string {
  return ((import.meta as any)?.env?.[key] as string | undefined) ?? fallback
}

export function getApiBaseUrl(): string {
  const mock = getEnv('VITE_MOCK_API') === '1'
  if (mock) return ''
  return getEnv('VITE_API_BASE_URL') || 'https://api.scxdrop.online'
}
