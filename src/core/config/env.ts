
export function getApiBaseUrl(): string {
  if (import.meta.env.VITE_MOCK_API === '1' ||
      import.meta.env.VITE_MOCK_API === 'true') return ''

  if (import.meta.env.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL

  if (import.meta.env.PROD) return ''

  return 'http://localhost'
}

export function getEnv(key: string, fallback = ''): string {
  return (import.meta.env[key] as string | undefined) ?? fallback
}
