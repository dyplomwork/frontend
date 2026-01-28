import { http, HttpResponse } from 'msw'
import { applyBalanceDelta, cancelBattle, clearUser, createBattle, getBattle, getMockToken, getOrCreateUser, joinBattle, leaveBattle, listBattles, peekBattle, readyBattle, setUser } from './db'

function json<T>(data: T, status = 200) {
  return HttpResponse.json(data as any, { status })
}

function ok<T>(data: T, status = 200) {
  return json({ ok: true, ...(data as any) }, status)
}

function meFromAuth() {
  return getOrCreateUser()
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

  http.get(/\/api\/v1\/accounts\/users\/me$/, () => {
    return ok({ user: meFromAuth() })
  }),

  http.get(/\/api\/me$/, () => {
    return ok({ user: meFromAuth() })
  }),

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

  http.get(/\/api\/v1\/battles$/, () => {
    return json(listBattles())
  }),

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

  http.get(/\/api\/v1\/battles\/([^/]+)$/, ({ params, request }) => {
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
]
