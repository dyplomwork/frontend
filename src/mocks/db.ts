export type User = { id: string; nickname: string; discord: string; role: 'user' | 'admin'; balance: number }

export type CoinSide = 'heads' | 'tails'
export type BattleStatus = 'OPEN' | 'FULL' | 'COUNTDOWN' | 'RUNNING' | 'FINISHED' | 'CANCELLED' | 'ABANDONED'

export type Battle = {
  id: string
  amount: number
  status: BattleStatus
  creatorId: string
  creatorNick: string
  creatorSide: CoinSide | null
  creatorReady: boolean
  joinerId: string | null
  joinerNick: string | null
  joinerSide: CoinSide | null
  joinerReady: boolean
  countdownStartedAt: string | null
  winnerId: string | null
  winnerSide: CoinSide | null
  resultSide: CoinSide | null
  createdAt: string
  updatedAt: string
}

const nowIso = () => new Date().toISOString()

function rid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`
}

const lsKeyUser = 'mock_user_v1'
const lsKeyToken = 'mock_token_v1'
const lsKeyBattles = 'mock_battles_v1'
const lsKeyClicker = 'mock_clicker_v1'
const lsKeyInventory = 'mock_inventory_v1'
const lsKeyAuction = 'mock_auction_v1'
const lsKeyDonations = 'mock_donations_v1'
const lsKeyAdminUsers = 'mock_admin_users_v1'
const lsKeyAdminMeta = 'mock_admin_meta_v1'

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeStorage<T>(key: string, value: T) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(value))
}

function removeStorage(key: string) {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(key)
}

export function getMockToken(): string {
  const t = readStorage<string | null>(lsKeyToken, null)
  if (t) return t
  const nt = rid('t')
  writeStorage(lsKeyToken, nt)
  return nt
}

export function getOrCreateUser(): User {
  const raw = readStorage<string | null>(lsKeyUser, null)
  if (raw) {
    try {
      return JSON.parse(raw)
    } catch {}
  }
  const u: User = { id: rid('u'), nickname: 'Tester', discord: 'tester', role: 'user', balance: 10000 }
  writeStorage(lsKeyUser, u)
  return u
}

export function setUser(u: User) {
  writeStorage(lsKeyUser, u)
}

export function clearUser() {
  removeStorage(lsKeyUser)
  removeStorage(lsKeyToken)
}

function loadBattles(): Record<string, Battle> {
  return readStorage<Record<string, Battle>>(lsKeyBattles, {})
}

function saveBattles(map: Record<string, Battle>) {
  writeStorage(lsKeyBattles, map)
}

let battles = loadBattles()

export function peekBattle(id: string): Battle | null {
  return battles[id] || null
}

function seedInitial() {
  if (Object.keys(battles).length) return
  const u = getOrCreateUser()
  for (let i = 0; i < 3; i++) {
    const id = rid('b')
    const createdAt = nowIso()
    const b: Battle = {
      id,
      amount: (i + 1) * 100,
      status: 'OPEN',
      creatorId: u.id,
      creatorNick: u.nickname,
      creatorSide: i % 2 === 0 ? 'heads' : 'tails',
      creatorReady: false,
      joinerId: null,
      joinerNick: null,
      joinerSide: null,
      joinerReady: false,
      countdownStartedAt: null,
      winnerId: null,
      winnerSide: null,
      resultSide: null,
      createdAt,
      updatedAt: createdAt,
    }
    battles[id] = b
  }
  saveBattles(battles)
}

seedInitial()

export function listBattles(): Battle[] {
  advanceAll()
  return Object.values(battles).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

export function getBattle(id: string): Battle | null {
  const b = battles[id]
  if (!b) return null
  const nb = advanceOne(b)
  battles[id] = nb
  saveBattles(battles)
  return nb
}

export function createBattle(amount: number, side: CoinSide | null, me: User): Battle {
  const id = rid('b')
  const createdAt = nowIso()
  const b: Battle = {
    id,
    amount,
    status: 'OPEN',
    creatorId: me.id,
    creatorNick: me.nickname,
    creatorSide: side,
    creatorReady: false,
    joinerId: null,
    joinerNick: null,
    joinerSide: null,
    joinerReady: false,
    countdownStartedAt: null,
    winnerId: null,
    winnerSide: null,
    resultSide: null,
    createdAt,
    updatedAt: createdAt,
  }
  battles[id] = b
  saveBattles(battles)
  return b
}

export function joinBattle(id: string, me: User): Battle | null {
  const b = getBattle(id)
  if (!b) return null
  if (b.status !== 'OPEN') return b
  if (b.creatorId === me.id) return b
  const nb: Battle = {
    ...b,
    status: 'FULL',
    joinerId: me.id,
    joinerNick: me.nickname,
    joinerSide: b.creatorSide ? (b.creatorSide === 'heads' ? 'tails' : 'heads') : null,
    updatedAt: nowIso(),
  }
  battles[id] = nb
  saveBattles(battles)
  return nb
}

export function leaveBattle(id: string, me: User): Battle | null {
  const b = getBattle(id)
  if (!b) return null
  if (b.status === 'RUNNING' || b.status === 'FINISHED') return b
  if (b.creatorId === me.id) {
    const nb: Battle = { ...b, status: 'CANCELLED', updatedAt: nowIso() }
    battles[id] = nb
    saveBattles(battles)
    return nb
  }
  if (b.joinerId !== me.id) return b
  const nb: Battle = {
    ...b,
    status: 'OPEN',
    joinerId: null,
    joinerNick: null,
    joinerSide: null,
    joinerReady: false,
    countdownStartedAt: null,
    updatedAt: nowIso(),
  }
  battles[id] = nb
  saveBattles(battles)
  return nb
}

export function cancelBattle(id: string, me: User): boolean {
  const b = getBattle(id)
  if (!b) return false
  if (b.creatorId !== me.id) return false
  const nb: Battle = { ...b, status: 'CANCELLED', updatedAt: nowIso() }
  battles[id] = nb
  saveBattles(battles)
  return true
}

export function readyBattle(id: string, me: User): Battle | null {
  const b = getBattle(id)
  if (!b) return null
  if (b.status === 'CANCELLED' || b.status === 'ABANDONED') return b
  const nb = { ...b }
  if (me.id === b.creatorId) nb.creatorReady = true
  if (me.id === b.joinerId) nb.joinerReady = true

  const both = !!nb.joinerId && nb.creatorReady && nb.joinerReady
  if (both && (nb.status === 'FULL' || nb.status === 'OPEN')) {
    nb.status = 'COUNTDOWN'
    nb.countdownStartedAt = nowIso()
  }
  nb.updatedAt = nowIso()
  battles[id] = nb
  saveBattles(battles)
  return nb
}

function resultFromId(id: string): CoinSide {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h % 2 === 0 ? 'heads' : 'tails'
}

function advanceOne(b: Battle): Battle {
  if (b.status === 'COUNTDOWN') {
    const started = b.countdownStartedAt ? new Date(b.countdownStartedAt).getTime() : 0
    if (!started) return b
    const elapsed = Date.now() - started
    if (elapsed >= 3000) {
      const res = resultFromId(b.id)
      const winnerId = res === (b.creatorSide || res) ? b.creatorId : b.joinerId || b.creatorId
      const winnerSide: CoinSide =
        winnerId === b.creatorId ? (b.creatorSide || res) : (b.joinerSide || (b.creatorSide ? (b.creatorSide === 'heads' ? 'tails' : 'heads') : res))
      return {
        ...b,
        status: 'FINISHED',
        resultSide: res,
        winnerId,
        winnerSide,
        updatedAt: nowIso(),
      }
    }
  }
  return b
}

function advanceAll() {
  const ids = Object.keys(battles)
  let changed = false
  for (const id of ids) {
    const b = battles[id]
    const nb = advanceOne(b)
    if (nb !== b) {
      battles[id] = nb
      changed = true
    }
  }
  if (changed) saveBattles(battles)
}

export function mockBalanceFor(me: User): number {
  const u = getOrCreateUser()
  return u.balance
}

export function applyBalanceDelta(delta: number) {
  const u = getOrCreateUser()
  const nu = { ...u, balance: Math.max(0, Number(u.balance || 0) + delta) }
  setUser(nu)
  return nu.balance
}

function getDefaultClickerState() {
  return {
    coins: 2500,
    clickPower: 1,
    autoPower: 0,
    upgrades: {} as Record<string, number>,
    upgradeList: [
      {
        id: 'tap_bot',
        tier: 1,
        coinCost: 100,
        maxLevel: 12,
        name: 'Tap Bot',
        nameUa: 'Тап-бот',
        desc: 'Auto taps to boost your pace.',
        descUa: 'Автоматичне натискання для прискорення.',
        visual: 'spark',
      },
      {
        id: 'golden_guard',
        tier: 2,
        coinCost: 250,
        maxLevel: 8,
        name: 'Golden Guard',
        nameUa: 'Золотий захисник',
        desc: 'Adds passive coins.',
        descUa: 'Додає пасивні монети.',
        visual: 'shield',
      },
      {
        id: 'sword_slash',
        tier: 3,
        coinCost: 500,
        maxLevel: 6,
        name: 'Sword Slash',
        nameUa: 'Удар мечем',
        desc: 'Boosts your click impact.',
        descUa: 'Підсилює силу кліку.',
        visual: 'dragon',
      },
    ],
    convertRate: 1000,
  }
}

let clickerState = readStorage(lsKeyClicker, getDefaultClickerState())

function saveClickerState() {
  writeStorage(lsKeyClicker, clickerState)
}

export function getClickerSnapshot() {
  return {
    ...clickerState,
    upgrades: { ...clickerState.upgrades },
    upgradeList: clickerState.upgradeList.map(x => ({ ...x })),
  }
}

export function applyClickerCoins(delta: number) {
  clickerState.coins = Math.max(0, Number(clickerState.coins || 0) + delta)
  saveClickerState()
  return clickerState.coins
}

export function clickerClick(clicks: number) {
  clickerState.coins = Math.max(0, Number(clickerState.coins || 0) + clicks)
  saveClickerState()
  return clickerState.coins
}

export function clickerUpgrade(upgradeId: string) {
  const target = clickerState.upgradeList.find(u => u.id === upgradeId)
  if (!target) return getClickerSnapshot()
  const level = Number(clickerState.upgrades[upgradeId] || 0)
  const nextCost = Math.max(1, Number(target.coinCost) * (level + 1))
  clickerState.upgrades[upgradeId] = level + 1
  clickerState.coins = Math.max(0, Number(clickerState.coins || 0) - nextCost)
  if (upgradeId === 'tap_bot') clickerState.clickPower += 1
  if (upgradeId === 'golden_guard') clickerState.autoPower += 2
  if (upgradeId === 'sword_slash') clickerState.clickPower += 2
  saveClickerState()
  return getClickerSnapshot()
}

export function clickerConvert() {
  const rate = Number(clickerState.convertRate || 1000)
  const earned = Math.max(0, Math.floor(Number(clickerState.coins || 0) / rate))
  if (earned > 0) {
    clickerState.coins = Math.max(0, Number(clickerState.coins || 0) - earned * rate)
    const u = getOrCreateUser()
    applyBalanceDelta(earned)
    setUser({ ...u, balance: Number(u.balance || 0) + earned })
    saveClickerState()
  }
  return { coinsLeft: clickerState.coins, kCoinsEarned: earned }
}

function getDefaultInventoryItems() {
  return [
    { id: 'inv_1', itemDefId: 'bronze_shard', name: 'Bronze Shard', nameUa: 'Бронзова частина', rarity: 'common', icon: '🪙', color: '#9ca3af', value: 120, source: 'drop', createdAt: nowIso(), listingId: null },
    { id: 'inv_2', itemDefId: 'sapphire', name: 'Sapphire', nameUa: 'Сапфір', rarity: 'rare', icon: '💎', color: '#3b82f6', value: 420, source: 'drop', createdAt: nowIso(), listingId: null },
    { id: 'inv_3', itemDefId: 'dragon_crystal', name: 'Dragon Crystal', nameUa: 'Кристал дракона', rarity: 'epic', icon: '🔮', color: '#a855f7', value: 980, source: 'drop', createdAt: nowIso(), listingId: null },
  ]
}

let inventoryItems = readStorage(lsKeyInventory, getDefaultInventoryItems())

function saveInventory() {
  writeStorage(lsKeyInventory, inventoryItems)
}

export function getInventoryItems() {
  return inventoryItems.map(x => ({ ...x }))
}

export function sellInventoryItem(itemId: string) {
  const item = inventoryItems.find(x => x.id === itemId)
  if (!item) return null
  const gained = Math.floor(Number(item.value || 0) * 0.5)
  inventoryItems = inventoryItems.filter(x => x.id !== itemId)
  saveInventory()
  const u = getOrCreateUser()
  const nu = { ...u, balance: Number(u.balance || 0) + gained }
  setUser(nu)
  return { gained, balance: nu.balance }
}

function getDefaultAuctionListings() {
  return [
    { id: 'listing_1', sellerId: 'seller_1', sellerNick: 'Market', itemId: 'inv_2', itemDefId: 'sapphire', name: 'Sapphire', nameUa: 'Сапфір', rarity: 'rare', icon: '💎', color: '#3b82f6', baseValue: 420, price: 480, status: 'listed', buyerId: null, buyerNick: null, createdAt: nowIso() },
    { id: 'listing_2', sellerId: 'seller_2', sellerNick: 'Trader', itemId: 'inv_3', itemDefId: 'dragon_crystal', name: 'Dragon Crystal', nameUa: 'Кристал дракона', rarity: 'epic', icon: '🔮', color: '#a855f7', baseValue: 980, price: 1100, status: 'listed', buyerId: null, buyerNick: null, createdAt: nowIso() },
  ]
}

let auctionListings = readStorage(lsKeyAuction, getDefaultAuctionListings())

function saveAuction() {
  writeStorage(lsKeyAuction, auctionListings)
}

export function getAuctionListings() {
  return auctionListings.map(x => ({ ...x }))
}

export function createAuctionListing(itemId: string, price: number) {
  const item = inventoryItems.find(x => x.id === itemId)
  if (!item) return null
  const listing = {
    id: rid('listing'),
    sellerId: item.id,
    sellerNick: getOrCreateUser().nickname,
    itemId: item.id,
    itemDefId: item.itemDefId,
    name: item.name,
    nameUa: item.nameUa,
    rarity: item.rarity,
    icon: item.icon,
    color: item.color,
    baseValue: Number(item.value || 0),
    price: Number(price || 0),
    status: 'listed',
    buyerId: null,
    buyerNick: null,
    createdAt: nowIso(),
  }
  auctionListings = [listing, ...auctionListings]
  item.listingId = listing.id
  saveAuction()
  saveInventory()
  return listing
}

export function buyAuctionListing(listingId: string) {
  const listing = auctionListings.find(x => x.id === listingId)
  if (!listing) return null
  const u = getOrCreateUser()
  if (Number(u.balance || 0) < Number(listing.price || 0)) return null
  const nu = { ...u, balance: Number(u.balance || 0) - Number(listing.price || 0) }
  setUser(nu)
  auctionListings = auctionListings.filter(x => x.id !== listingId)
  saveAuction()
  return { balance: nu.balance }
}

export function deleteAuctionListing(listingId: string) {
  const listing = auctionListings.find(x => x.id === listingId)
  if (!listing) return null
  auctionListings = auctionListings.filter(x => x.id !== listingId)
  const item = inventoryItems.find(x => x.id === listing.itemId)
  if (item) item.listingId = null
  saveAuction()
  saveInventory()
  return true
}

function getDefaultDonations() {
  return [
    { id: 'don_1', packageId: 'pack_basic', amountUsd: 4.99, coinsCredited: 4000, status: 'paid', createdAt: nowIso() },
  ]
}

let donations = readStorage(lsKeyDonations, getDefaultDonations())

function saveDonations() {
  writeStorage(lsKeyDonations, donations)
}

export function getDonationPackages() {
  return [
    { id: 'pack_basic', priceUsd: 4.99, coins: 4000, bonusPct: 10 },
    { id: 'pack_premium', priceUsd: 9.99, coins: 10000, bonusPct: 25 },
  ]
}

export function getDonationHistory() {
  return donations.map(x => ({ ...x }))
}

export function checkoutDonation(packageId: string) {
  const pkg = getDonationPackages().find(x => x.id === packageId)
  if (!pkg) return null
  const u = getOrCreateUser()
  const amount = Number(pkg.coins || 0)
  const nu = { ...u, balance: Number(u.balance || 0) + amount }
  setUser(nu)
  const entry = { id: rid('don'), packageId, amountUsd: pkg.priceUsd, coinsCredited: amount, status: 'paid', createdAt: nowIso() }
  donations = [entry, ...donations]
  saveDonations()
  return { ok: true, balance: nu.balance, coinsCredited: amount, duplicate: false }
}

function getDefaultAdminUsers() {
  const u = getOrCreateUser()
  return [
    { ...u, createdAt: nowIso(), achievements: ['ach_1'], items: ['item_1'], status: 'active', lastSeen: nowIso(), clickerCoins: 2500 },
  ]
}

let adminUsers = readStorage(lsKeyAdminUsers, getDefaultAdminUsers())

function saveAdminUsers() {
  writeStorage(lsKeyAdminUsers, adminUsers)
}

function getDefaultAdminMeta() {
  return {
    achievements: [
      { id: 'ach_1', name: 'First Steps', icon: '🥇', rarity: 'common' },
      { id: 'ach_2', name: 'Lucky Streak', icon: '🍀', rarity: 'rare' },
    ],
    items: [
      { id: 'item_1', name: 'Starter Badge', icon: '🎖️', rarity: 'common' },
      { id: 'item_2', name: 'Legendary Charm', icon: '✨', rarity: 'mythic' },
    ],
  }
}

let adminMeta = readStorage(lsKeyAdminMeta, getDefaultAdminMeta())

function saveAdminMeta() {
  writeStorage(lsKeyAdminMeta, adminMeta)
}

export function getAdminDashboard() {
  return {
    dashboard: {
      totalUsers: adminUsers.length,
      totalItems: inventoryItems.length,
      totalBattles: Object.keys(battles).length,
      totalDonations: donations.length,
    },
  }
}

export function getAdminUsers(search = '', role = '', status = '', page = 1, pageSize = 20) {
  let rows = adminUsers.slice()
  const q = search.toLowerCase()
  if (q) rows = rows.filter(u => String(u.nickname || '').toLowerCase().includes(q))
  if (role) rows = rows.filter(u => String(u.role || '').toLowerCase() === role.toLowerCase())
  if (status) rows = rows.filter(u => String(u.status || '').toLowerCase() === status.toLowerCase())
  const start = (Number(page || 1) - 1) * Number(pageSize || 20)
  const end = start + Number(pageSize || 20)
  return { users: rows.slice(start, end), total: rows.length }
}

export function getAdminUser(id: string) {
  const u = adminUsers.find(x => x.id === id)
  if (!u) return null
  return { user: { ...u } }
}

export function adminUpdateUser(id: string, patch: Record<string, any>) {
  adminUsers = adminUsers.map(u => (u.id === id ? { ...u, ...patch } : u))
  saveAdminUsers()
  return true
}

export function adminGiveBalance(id: string, amount: number) {
  adminUsers = adminUsers.map(u => (u.id === id ? { ...u, balance: Number(u.balance || 0) + Number(amount || 0) } : u))
  saveAdminUsers()
  const u = adminUsers.find(x => x.id === id)
  return { balance: u?.balance ?? 0 }
}

export function adminGiveItem(id: string, itemDefId: string) {
  const u = adminUsers.find(x => x.id === id)
  if (!u) return false
  u.items = [...(u.items || []), itemDefId]
  saveAdminUsers()
  return true
}

export function adminGiveClickerCoins(id: string, amount: number) {
  const u = adminUsers.find(x => x.id === id)
  if (!u) return false
  u.clickerCoins = Number(u.clickerCoins || 0) + Number(amount || 0)
  saveAdminUsers()
  return { coins: u.clickerCoins }
}

export function adminGiveAchievement(id: string, achievementId: string) {
  const u = adminUsers.find(x => x.id === id)
  if (!u) return false
  u.achievements = Array.from(new Set([...(u.achievements || []), achievementId]))
  saveAdminUsers()
  return true
}

export function adminRevokeAchievement(userId: string, achievementId: string) {
  const u = adminUsers.find(x => x.id === userId)
  if (!u) return false
  u.achievements = (u.achievements || []).filter(x => x !== achievementId)
  saveAdminUsers()
  return true
}

export function adminDeleteUser(id: string) {
  adminUsers = adminUsers.filter(x => x.id !== id)
  saveAdminUsers()
  return true
}

export function adminBanUser(id: string) {
  adminUsers = adminUsers.map(u => (u.id === id ? { ...u, status: 'banned' } : u))
  saveAdminUsers()
  return true
}

export function adminUnbanUser(id: string) {
  adminUsers = adminUsers.map(u => (u.id === id ? { ...u, status: 'active' } : u))
  saveAdminUsers()
  return true
}

export function getAdminMeta() {
  return adminMeta
}

export function getAdminAudit() {
  return { actions: [
    { id: 'audit_1', actor: 'system', action: 'seed', createdAt: nowIso() },
  ] }
}

export function getAdminDonations(limit = 200) {
  return donations.slice(0, Number(limit || 200))
}

export function getAdminAnalytics() {
  return { analytics: { totalBets: Object.keys(battles).length, totalRevenue: 12500, popularGame: 'dice' } }
}

export function getBattleHistory(limit = 100) {
  return Object.values(battles).slice(0, Number(limit || 100))
}

export function getRecentDrops() {
  return [
    { nick: 'Tester', icon: '💎', name: 'Sapphire', nameUa: 'Сапфір', rarity: 'rare', color: '#3b82f6', ts: Date.now() - 1000, type: 'item', amount: 1 },
    { nick: 'Admin', icon: '🎁', name: 'Chest', nameUa: 'Скриня', rarity: 'epic', color: '#a855f7', ts: Date.now() - 2000, type: 'case', amount: 1 },
  ]
}

export function getStatsMe() {
  return { stats: { wins: 12, losses: 4, totalBet: 2500, totalEarned: 4200 } }
}

export function setAdminMeta(next: Record<string, any>) {
  adminMeta = { ...adminMeta, ...next }
  saveAdminMeta()
  return adminMeta
}
