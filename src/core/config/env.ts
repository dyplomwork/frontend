
export function getEnv(key: string, fallback = ''): string {
  return ((import.meta as any)?.env?.[key] as string | undefined) ?? fallback
}

export function getApiBaseUrl(): string {
  return getEnv('VITE_API_BASE_URL') || 'https://api.scxdrop.online'
}
