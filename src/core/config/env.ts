/**
 * In production (Vercel): same-origin requests → Vercel rewrites → Railway.
 * In local dev: VITE_API_BASE_URL=http://localhost (set in .env.local only).
 *
 * import.meta.env.PROD / .DEV are statically replaced by Vite at build time.
 * Do NOT use dynamic bracket access (env[key]) or (import.meta as any) casts —
 * Vite cannot statically replace those patterns.
 */

export function getApiBaseUrl(): string {
  // Mock mode → MSW handles all requests, no real base URL needed
  if (import.meta.env.VITE_MOCK_API === '1' ||
      import.meta.env.VITE_MOCK_API === 'true') return ''

  // Explicit override (only set in .env.local, never committed)
  if (import.meta.env.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL

  // Production build: PROD is statically `true` → same-origin → Vercel rewrites
  if (import.meta.env.PROD) return ''

  // Dev server fallback (should be covered by VITE_API_BASE_URL in .env.local)
  return 'http://localhost'
}

/** Read any VITE_ env variable by name (use sparingly — prefer direct access). */
export function getEnv(key: string, fallback = ''): string {
  // Vite injects all VITE_* vars into import.meta.env at build time.
  // Bracket access works at runtime on the injected object.
  return (import.meta.env[key] as string | undefined) ?? fallback
}
