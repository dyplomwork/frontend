export function getEnv(key: string, fallback = ''): string {
  return (import.meta.env[key] as string | undefined) ?? fallback
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
  // Use import.meta.env.DEV directly — Vite statically replaces this with
  // the literal `false` in production builds (including vite-ssg).
  // The `(import.meta as any).env?.DEV` cast+optional-chain pattern is NOT
  // replaced statically and evaluates to true in the Node.js SSG context.
  return import.meta.env.DEV ? 'http://localhost' : ''
}
