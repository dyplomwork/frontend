import fs from 'node:fs'
import path from 'node:path'

const cwd = process.cwd()

const SITE_URL =
  process.env.VITE_SITE_URL ||
  process.env.SITE_URL ||
  'https://example.vercel.app'

const routes = ['/', '/login', '/register', '/plinko', '/roulette', '/mines', '/dice', '/coinflip', '/cases']

const caseIds = ['starter', 'premium', 'elite']

const allRoutes = [...routes, ...caseIds.map((id) => `/cases/${id}`)]

function xmlEscape(s) {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function joinUrl(base, p) {
  const b = base.endsWith('/') ? base.slice(0, -1) : base
  const pp = p.startsWith('/') ? p : `/${p}`
  return `${b}${pp}`
}

const urlset = allRoutes
  .map((p) => {
    const loc = xmlEscape(joinUrl(SITE_URL, p))
    return `  <url><loc>${loc}</loc></url>`
  })
  .join('\n')

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlset}
</urlset>
`

const robots = `User-agent: *
Allow: /

Sitemap: ${joinUrl(SITE_URL, '/sitemap.xml')}
`

fs.writeFileSync(path.join(cwd, 'public', 'sitemap.xml'), sitemap, 'utf8')
fs.writeFileSync(path.join(cwd, 'public', 'robots.txt'), robots, 'utf8')

console.log(`[sitemap] Generated ${allRoutes.length} urls for ${SITE_URL}`)
