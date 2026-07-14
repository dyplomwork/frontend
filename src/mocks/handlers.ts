import { http, HttpResponse } from 'msw'
import {
  adminBanUser,
  adminDeleteUser,
  adminGiveAchievement,
  adminGiveBalance,
  adminGiveClickerCoins,
  adminGiveItem,
  adminRevokeAchievement,
  adminUnbanUser,
  adminUpdateUser,
  applyBalanceDelta,
  buyAuctionListing,
  cancelBattle,
  checkoutDonation,
  clearUser,
  clickerClick,
  clickerConvert,
  clickerUpgrade,
  createAuctionListing,
  createBattle,
  deleteAuctionListing,
  getAdminAnalytics,
  getAdminAudit,
  getAdminDashboard,
  getAdminDonations,
  getAdminMeta,
  getAdminUser,
  getAdminUsers,
  getAuctionListings,
  getBattle,
  getBattleHistory,
  getDonationHistory,
  getDonationPackages,
  getInventoryItems,
  getMockToken,
  getOrCreateUser,
  getRecentDrops,
  getStatsMe,
  joinBattle,
  leaveBattle,
  listBattles,
  peekBattle,
  readyBattle,
  sellInventoryItem,
  setAdminMeta,
  setUser,
  applyClickerCoins,
  getClickerSnapshot,
} from './db'

function json<T>(data: T, status = 200) {
  return HttpResponse.json(data as any, { status })
}

function ok<T>(data: T, status = 200) {
  return json({ ok: true, ...(data as any) }, status)
}

function meFromAuth() {
  return getOrCreateUser()
}

function isJsonBody(value: any): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export const handlers = [
  http.post(/\/api\/v1\/accounts\/auth\/login$/, async ({ request }) => {
    const body: any = await request.json().catch(() => ({}))
    const nick = String(body?.login || body?.nickname || 'Tester')
    const u = { ...getOrCreateUser(), nickname: nick, discord: nick }
    setUser(u)
    return ok({ token: getMockToken(), user: u })
  }),

  http.post(/\/api\/v1\/accounts\/auth\/register$/, async ({ request }) => {
    const body: any = await request.json().catch(() => ({}))
    const nick = String(body?.nickname || body?.login || 'Tester')
    const u = { ...getOrCreateUser(), nickname: nick, discord: nick }
    setUser(u)
    return ok({ token: getMockToken(), user: u })
  }),

  http.post(/\/api\/v1\/accounts\/auth\/google$/, async ({ request }) => {
    const body: any = await request.json().catch(() => ({}))
    const nick = String(body?.idToken || 'GoogleTester')
    const u = { ...getOrCreateUser(), nickname: nick, discord: nick }
    setUser(u)
    return ok({ token: getMockToken(), user: u })
  }),

  http.get(/\/api\/v1\/accounts\/users\/me$/, () => ok({ user: meFromAuth() })),
  http.get(/\/api\/me$/, () => ok({ user: meFromAuth() })),
  http.get(/\/api\/v1\/accounts\/users\/me\/balance$/, () => {
    const u = meFromAuth()
    return ok({ balance: u.balance })
  }),
  http.post(/\/api\/v1\/accounts\/logout$/, () => {
    clearUser()
    return ok({})
  }),

  http.post(/\/api\/balance\/apply$/, async ({ request }) => {
    const body: any = await request.json().catch(() => ({}))
    const delta = Number(body?.delta || 0)
    const balance = applyBalanceDelta(delta)
    return ok({ balance })
  }),

  http.get(/\/api\/v1\/drops\/recent$/, () => json(getRecentDrops())),
  http.get(/\/api\/v1\/stats\/me$/, () => json(getStatsMe())),

  http.get(/\/api\/v1\/battles$/, () => json(listBattles())),
  http.get(/\/api\/v1\/battles\/history$/, () => json(getBattleHistory())),
  http.post(/\/api\/v1\/battles$/, async ({ request }) => {
    const me = meFromAuth()
    const body: any = await request.json().catch(() => ({}))
    const amount = Math.max(0, Number(body?.amount || 0))
    const side = body?.side === 'heads' || body?.side === 'tails' ? body.side : null
    if (!amount) return json({ message: 'Bad amount' }, 400)
    if (Number(me.balance || 0) < amount) return json({ message: 'Insufficient balance' }, 400)
    const b = createBattle(amount, side, me)
    applyBalanceDelta(-amount)
    return json(b, 201)
  }),

  http.get(/\/api\/v1\/battles\/([^/]+)$/, ({ request }) => {
    const url = new URL(request.url)
    const m = url.pathname.match(/\/api\/v1\/battles\/([^/]+)$/)
    const id = m ? decodeURIComponent(m[1]) : ''
    const b = getBattle(id)
    if (!b) return json({ message: 'Not found' }, 404)
    return json(b)
  }),

  http.post(/\/api\/v1\/battles\/([^/]+)\/join$/, ({ request }) => {
    const me = meFromAuth()
    const url = new URL(request.url)
    const m = url.pathname.match(/\/api\/v1\/battles\/([^/]+)\/join$/)
    const id = m ? decodeURIComponent(m[1]) : ''
    const before = peekBattle(id)
    const b = joinBattle(id, me)
    if (!b) return json({ message: 'Not found' }, 404)
    const shouldCharge = !!before && before.status === 'OPEN' && !before.joinerId && before.creatorId !== me.id
    if (shouldCharge) {
      if (Number(me.balance || 0) < Number(b.amount || 0)) return json({ message: 'Insufficient balance' }, 400)
      applyBalanceDelta(-Number(b.amount || 0))
    }
    return json(b)
  }),

  http.post(/\/api\/v1\/battles\/([^/]+)\/leave$/, ({ request }) => {
    const me = meFromAuth()
    const url = new URL(request.url)
    const m = url.pathname.match(/\/api\/v1\/battles\/([^/]+)\/leave$/)
    const id = m ? decodeURIComponent(m[1]) : ''
    const before = peekBattle(id)
    const b = leaveBattle(id, me)
    if (!b) return json({ message: 'Not found' }, 404)
    const wasCreator = !!before && before.creatorId === me.id
    const wasJoiner = !!before && before.joinerId === me.id
    const refundable = !!before && (before.status === 'OPEN' || before.status === 'FULL' || before.status === 'COUNTDOWN')
    if (refundable && (wasCreator || wasJoiner)) applyBalanceDelta(Number(before.amount || 0))
    return json(b)
  }),

  http.post(/\/api\/v1\/battles\/([^/]+)\/ready$/, ({ request }) => {
    const me = meFromAuth()
    const url = new URL(request.url)
    const m = url.pathname.match(/\/api\/v1\/battles\/([^/]+)\/ready$/)
    const id = m ? decodeURIComponent(m[1]) : ''
    const b = readyBattle(id, me)
    if (!b) return json({ message: 'Not found' }, 404)
    return json(b)
  }),

  http.delete(/\/api\/v1\/battles\/([^/]+)$/, ({ request }) => {
    const me = meFromAuth()
    const url = new URL(request.url)
    const m = url.pathname.match(/\/api\/v1\/battles\/([^/]+)$/)
    const id = m ? decodeURIComponent(m[1]) : ''
    const before = peekBattle(id)
    const ok = cancelBattle(id, me)
    if (!ok) return json({ message: 'Forbidden' }, 403)
    if (before && before.creatorId === me.id) applyBalanceDelta(Number(before.amount || 0))
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(/\/api\/v1\/games\/dice\/game\/play$/, async ({ request }) => {
    const body = await request.json().catch(() => ({}))
    const bet = Number((body as any)?.bet || 0)
    const rollOver = Number((body as any)?.rollOver || 50)
    const roll = Math.floor(Math.random() * 100) + 1
    const isWin = roll > rollOver
    const payout = isWin ? Math.round(bet * 1.95) : 0
    return ok({ roll, isWin, payout })
  }),

  http.get(/\/api\/v1\/games\/dice\/game\/payout$/, ({ request }) => {
    const url = new URL(request.url)
    const rollOver = Number(url.searchParams.get('rollOver') || 50)
    const payout = Math.max(1, Math.round(100 / Math.max(1, rollOver)))
    return ok({ winChancePercentage: rollOver, payout })
  }),

  http.post(/\/api\/v1\/games\/roulette\/game\/play$/, async ({ request }) => {
    const body = await request.json().catch(() => ({}))
    const bets = Array.isArray((body as any)?.bets) ? (body as any).bets : []
    const amount = bets.reduce((sum: number, b: any) => sum + Number(b?.amount || 0), 0)
    const number = Math.floor(Math.random() * 37)
    return ok({ number, amount })
  }),

  http.get(/\/api\/v1\/games\/mines\/game$/, () => ok({ bet: 100, minesCount: 3, opened: [] })),
  http.post(/\/api\/v1\/games\/mines\/game\/start$/, async ({ request }) => {
    const body = await request.json().catch(() => ({}))
    const bet = Number((body as any)?.bet || 100)
    const mines = Number((body as any)?.mines || 3)
    return ok({ bet, mines })
  }),
  http.post(/\/api\/v1\/games\/mines\/game\/step$/, () => ok({ finish: false, nextMultiplier: 1.4, field: { field: [[false]], opened: [[false]] } })),
  http.post(/\/api\/v1\/games\/mines\/game\/finish$/, () => ok({ win: 150, field: { field: [[false]], opened: [[false]] } })),
  http.get(/\/api\/v1\/games\/mines\/game\/multiplier$/, ({ request }) => {
    const url = new URL(request.url)
    const opened = Number(url.searchParams.get('opened') || 0)
    const mines = Number(url.searchParams.get('mines') || 3)
    return ok(Math.max(1, 1 + opened * 0.3 + mines * 0.05))
  }),

  http.post(/\/api\/v1\/games\/cases\/game\/play$/, async ({ request }) => {
    const body = await request.json().catch(() => ({}))
    const type = String((body as any)?.type || 'starter')
    return ok({ item: `${type}-prize`, payout: 150 })
  }),
  http.get(/\/api\/v1\/games\/cases\/([^/]+)$/, () => ok({ id: 'starter', name: 'Starter Case', price: 10, items: [] })),

  http.get(/\/api\/v1\/games\/plinko\/game\/multipliers$/, ({ request }) => {
    const url = new URL(request.url)
    const rows = Number(url.searchParams.get('rows') || 8)
    const arr = Array.from({ length: rows + 1 }, (_, i) => 1 + i * 0.25)
    return ok(arr)
  }),
  http.post(/\/api\/v1\/games\/plinko\/game\/play$/, async ({ request }) => {
    const body = await request.json().catch(() => ({}))
    const balls = Number((body as any)?.balls || 1)
    const traces = Array.from({ length: Math.max(1, balls) }, () => ({ path: [0, 1, 2], payout: 1.2 }))
    return ok({ total: balls * 120, traces })
  }),

  http.get(/\/api\/v1\/clicker$/, () => {
    const state = getClickerSnapshot()
    return ok(state)
  }),
  http.post(/\/api\/v1\/clicker\/click$/, async ({ request }) => {
    const body = await request.json().catch(() => ({}))
    const clicks = Math.max(1, Number((body as any)?.clicks || 1))
    return ok({ coins: clickerClick(clicks) })
  }),
  http.post(/\/api\/v1\/clicker\/upgrade$/, async ({ request }) => {
    const body = await request.json().catch(() => ({}))
    const upgradeId = String((body as any)?.upgradeId || '')
    const state = clickerUpgrade(upgradeId)
    return ok(state)
  }),
  http.post(/\/api\/v1\/clicker\/convert$/, () => {
    const result = clickerConvert()
    return ok(result)
  }),

  http.get(/\/api\/v1\/auction$/, () => ok({ listings: getAuctionListings() })),
  http.post(/\/api\/v1\/auction$/, async ({ request }) => {
    const body = await request.json().catch(() => ({}))
    const itemId = String((body as any)?.itemId || '')
    const price = Number((body as any)?.price || 0)
    const listing = createAuctionListing(itemId, price)
    if (!listing) return json({ message: 'Item not found' }, 404)
    return ok({ listing })
  }),
  http.post(/\/api\/v1\/auction\/([^/]+)\/buy$/, ({ request }) => {
    const url = new URL(request.url)
    const m = url.pathname.match(/\/api\/v1\/auction\/([^/]+)\/buy$/)
    const id = m ? decodeURIComponent(m[1]) : ''
    const result = buyAuctionListing(id)
    if (!result) return json({ message: 'Listing not found' }, 404)
    return ok(result)
  }),
  http.delete(/\/api\/v1\/auction\/([^/]+)$/, ({ request }) => {
    const url = new URL(request.url)
    const m = url.pathname.match(/\/api\/v1\/auction\/([^/]+)$/)
    const id = m ? decodeURIComponent(m[1]) : ''
    const ok = deleteAuctionListing(id)
    if (!ok) return json({ message: 'Listing not found' }, 404)
    return new HttpResponse(null, { status: 204 })
  }),

  http.get(/\/api\/v1\/items\/me$/, () => ok({ items: getInventoryItems() })),
  http.post(/\/api\/v1\/items\/([^/]+)\/sell-vendor$/, ({ request }) => {
    const url = new URL(request.url)
    const m = url.pathname.match(/\/api\/v1\/items\/([^/]+)\/sell-vendor$/)
    const id = m ? decodeURIComponent(m[1]) : ''
    const result = sellInventoryItem(id)
    if (!result) return json({ message: 'Item not found' }, 404)
    return ok(result)
  }),

  http.get(/\/api\/v1\/donations\/packages$/, () => ok({ packages: getDonationPackages() })),
  http.get(/\/api\/v1\/donations\/me$/, () => ok({ donations: getDonationHistory() })),
  http.post(/\/api\/v1\/donations\/checkout$/, async ({ request }) => {
    const body = await request.json().catch(() => ({}))
    const packageId = String((body as any)?.packageId || '')
    const result = checkoutDonation(packageId)
    if (!result) return json({ message: 'Package not found' }, 404)
    return ok(result)
  }),

  http.get(/\/api\/v1\/admin\/dashboard$/, () => getAdminDashboard()),
  http.get(/\/api\/v1\/admin\/users$/, ({ request }) => {
    const url = new URL(request.url)
    const search = url.searchParams.get('search') || ''
    const role = url.searchParams.get('role') || ''
    const status = url.searchParams.get('status') || ''
    const page = url.searchParams.get('page') || '1'
    const pageSize = url.searchParams.get('pageSize') || '20'
    return ok(getAdminUsers(search, role, status, Number(page), Number(pageSize)))
  }),
  http.get(/\/api\/v1\/admin\/users\/([^/]+)$/, ({ request }) => {
    const url = new URL(request.url)
    const m = url.pathname.match(/\/api\/v1\/admin\/users\/([^/]+)$/)
    const id = m ? decodeURIComponent(m[1]) : ''
    const user = getAdminUser(id)
    if (!user) return json({ message: 'User not found' }, 404)
    return ok(user)
  }),
  http.patch(/\/api\/v1\/admin\/users\/([^/]+)$/, async ({ request }) => {
    const body = await request.json().catch(() => ({}))
    const url = new URL(request.url)
    const m = url.pathname.match(/\/api\/v1\/admin\/users\/([^/]+)$/)
    const id = m ? decodeURIComponent(m[1]) : ''
    const okResult = adminUpdateUser(id, isJsonBody(body) ? body : {})
    if (!okResult) return json({ message: 'User not found' }, 404)
    return ok({ ok: true })
  }),
  http.post(/\/api\/v1\/admin\/users\/([^/]+)\/give-balance$/, async ({ request }) => {
    const body = await request.json().catch(() => ({}))
    const url = new URL(request.url)
    const m = url.pathname.match(/\/api\/v1\/admin\/users\/([^/]+)\/give-balance$/)
    const id = m ? decodeURIComponent(m[1]) : ''
    const amount = Number((body as any)?.amount || 0)
    const result = adminGiveBalance(id, amount)
    return ok(result)
  }),
  http.post(/\/api\/v1\/admin\/users\/([^/]+)\/give-item$/, async ({ request }) => {
    const body = await request.json().catch(() => ({}))
    const url = new URL(request.url)
    const m = url.pathname.match(/\/api\/v1\/admin\/users\/([^/]+)\/give-item$/)
    const id = m ? decodeURIComponent(m[1]) : ''
    const itemDefId = String((body as any)?.itemDefId || '')
    const okResult = adminGiveItem(id, itemDefId)
    if (!okResult) return json({ message: 'User not found' }, 404)
    return ok({ ok: true })
  }),
  http.post(/\/api\/v1\/admin\/users\/([^/]+)\/give-clicker-coins$/, async ({ request }) => {
    const body = await request.json().catch(() => ({}))
    const url = new URL(request.url)
    const m = url.pathname.match(/\/api\/v1\/admin\/users\/([^/]+)\/give-clicker-coins$/)
    const id = m ? decodeURIComponent(m[1]) : ''
    const amount = Number((body as any)?.amount || 0)
    const result = adminGiveClickerCoins(id, amount)
    return ok(result)
  }),
  http.post(/\/api\/v1\/admin\/users\/([^/]+)\/give-achievement$/, async ({ request }) => {
    const body = await request.json().catch(() => ({}))
    const url = new URL(request.url)
    const m = url.pathname.match(/\/api\/v1\/admin\/users\/([^/]+)\/give-achievement$/)
    const id = m ? decodeURIComponent(m[1]) : ''
    const achievementId = String((body as any)?.achievementId || '')
    const okResult = adminGiveAchievement(id, achievementId)
    if (!okResult) return json({ message: 'User not found' }, 404)
    return ok({ ok: true })
  }),
  http.delete(/\/api\/v1\/admin\/users\/([^/]+)\/achievement\/([^/]+)$/, ({ request }) => {
    const url = new URL(request.url)
    const m = url.pathname.match(/\/api\/v1\/admin\/users\/([^/]+)\/achievement\/([^/]+)$/)
    const userId = m ? decodeURIComponent(m[1]) : ''
    const achievementId = m ? decodeURIComponent(m[2]) : ''
    const okResult = adminRevokeAchievement(userId, achievementId)
    if (!okResult) return json({ message: 'User not found' }, 404)
    return new HttpResponse(null, { status: 204 })
  }),
  http.delete(/\/api\/v1\/admin\/users\/([^/]+)$/, ({ request }) => {
    const url = new URL(request.url)
    const m = url.pathname.match(/\/api\/v1\/admin\/users\/([^/]+)$/)
    const id = m ? decodeURIComponent(m[1]) : ''
    const okResult = adminDeleteUser(id)
    if (!okResult) return new HttpResponse(null, { status: 204 })
    return new HttpResponse(null, { status: 204 })
  }),
  http.post(/\/api\/v1\/admin\/users\/([^/]+)\/ban$/, ({ request }) => {
    const url = new URL(request.url)
    const m = url.pathname.match(/\/api\/v1\/admin\/users\/([^/]+)\/ban$/)
    const id = m ? decodeURIComponent(m[1]) : ''
    const okResult = adminBanUser(id)
    if (!okResult) return json({ message: 'User not found' }, 404)
    return ok({ ok: true })
  }),
  http.post(/\/api\/v1\/admin\/users\/([^/]+)\/unban$/, ({ request }) => {
    const url = new URL(request.url)
    const m = url.pathname.match(/\/api\/v1\/admin\/users\/([^/]+)\/unban$/)
    const id = m ? decodeURIComponent(m[1]) : ''
    const okResult = adminUnbanUser(id)
    if (!okResult) return json({ message: 'User not found' }, 404)
    return ok({ ok: true })
  }),
  http.get(/\/api\/v1\/admin\/audit$/, () => ok(getAdminAudit())),
  http.get(/\/api\/v1\/admin\/donations$/, ({ request }) => {
    const url = new URL(request.url)
    const limit = url.searchParams.get('limit') || '200'
    return ok(getAdminDonations(Number(limit)))
  }),
  http.get(/\/api\/v1\/admin\/analytics$/, () => ok(getAdminAnalytics())),
  http.get(/\/api\/v1\/admin\/meta$/, () => ok(getAdminMeta())),
]
