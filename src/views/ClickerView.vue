<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import { api } from '../utils/api'
import { formatNumber } from '../utils/format'

const { t, locale } = useI18n()
const auth = useAuthStore()
const ui = useUiStore()

const coins = ref(0)
const clickPower = ref(1)
const autoPower = ref(0)
const upgrades = ref<Record<string, number>>({})
const upgradeList = ref<any[]>([])
const convertRate = ref(1000)
const message = ref('')
const messageType = ref<'success' | 'error' | 'info'>('info')
const clickAnim = ref(false)
const clickParticles = ref<{ id: number; x: number; y: number; val: number }[]>([])
let particleId = 0

// Click batching — accumulate clicks, flush every 400ms
let pendingClicks = 0
let batchTimer: number | null = null
let isSending = false

const fmt = (v: number) => formatNumber(v, 0)
const fmtK = (v: number) => formatNumber(v, 2)

function setMsg(text: string, type: 'success' | 'error' | 'info' = 'info') {
  message.value = text; messageType.value = type
}

function upgName(u: any) { return locale.value === 'ua' ? u.nameUa : u.name }
function upgDesc(u: any) { return locale.value === 'ua' ? u.descUa : u.desc }
function getLevel(id: string) { return Number(upgrades.value[id] ?? 0) }
function isMaxed(u: any) { return getLevel(u.id) >= u.maxLevel }
function canAffordCoin(u: any): boolean {
  if (u.itemReq) return true // can't pre-check items on frontend
  const lvl = getLevel(u.id)
  return Number(coins.value) >= u.coinCost * (lvl + 1)
}
function upgCostLabel(u: any) {
  if (u.itemReq) {
    const { count, itemDefId } = u.itemReq
    const nameMap: Record<string,string> = {
      lucky_coin: '🍀 Lucky Coin', silver_shard: '💿 Silver Shard',
      sapphire: '💎 Sapphire', dragon_crystal: '🔮 Dragon Crystal',
      void_essence: '🌑 Void Essence', shadow_crown: '👑 Shadow Crown',
      phoenix_feather: '🔥 Phoenix Feather', cosmos_gem: '🌌 Cosmos Gem',
    }
    return `${count}× ${nameMap[itemDefId] ?? itemDefId}`
  }
  const lvl = getLevel(u.id)
  return `${fmt(u.coinCost * (lvl + 1))} 🪙`
}

// Active visuals from purchased upgrades
const activeVisuals = computed(() => {
  const v = new Set<string>()
  for (const u of upgradeList.value) {
    if (u.visual && getLevel(u.id) > 0) v.add(u.visual)
  }
  return v
})

const robotCount = computed(() => getLevel('tap_bot'))
const isCosmos = computed(() => activeVisuals.value.has('cosmos'))
const isDragon = computed(() => activeVisuals.value.has('dragon'))
const isPhoenix = computed(() => activeVisuals.value.has('phoenix'))
const isVoid = computed(() => activeVisuals.value.has('void'))
const isShadow = computed(() => activeVisuals.value.has('shadow'))
const isSapphire = computed(() => activeVisuals.value.has('sapphire'))

async function fetchState() {
  if (!auth.user) return
  try {
    const res = await api<any>('/api/v1/clicker', { method: 'GET' })
    coins.value = Number(res.coins) || 0
    clickPower.value = Number(res.clickPower) || 1
    autoPower.value = Number(res.autoPower) || 0
    upgrades.value = res.upgrades ?? {}
    upgradeList.value = res.upgradeList ?? []
    convertRate.value = Number(res.convertRate) || 1000
  } catch {}
}

async function flushClicks() {
  if (isSending || pendingClicks === 0) return
  isSending = true
  const toSend = pendingClicks
  pendingClicks = 0
  try {
    const res = await api<any>('/api/v1/clicker/click', { method: 'POST', json: true, body: { clicks: toSend } })
    // Server is the source of truth — reconcile if diff is large
    const serverCoins = Number(res.coins)
    if (Math.abs(serverCoins - Number(coins.value)) > Number(clickPower.value) * 10) {
      coins.value = serverCoins
    }
  } catch {} finally {
    isSending = false
    // Schedule next flush if more clicks accumulated while we were sending
    if (pendingClicks > 0) {
      batchTimer = window.setTimeout(flushClicks, 400)
    }
  }
}

function spawnParticle() {
  const p = { id: ++particleId, x: 35 + Math.random() * 30, y: 10 + Math.random() * 20, val: clickPower.value }
  clickParticles.value.push(p)
  setTimeout(() => { clickParticles.value = clickParticles.value.filter(x => x.id !== p.id) }, 700)
}

function click() {
  if (!auth.user) { ui.toast(t('ui.s_need_login'), 'info'); return }
  // Optimistic update — always numeric
  coins.value = Number(coins.value) + Number(clickPower.value)
  pendingClicks++
  clickAnim.value = false
  void Promise.resolve().then(() => { clickAnim.value = true })
  spawnParticle()

  // Schedule batch flush
  if (!batchTimer) {
    batchTimer = window.setTimeout(() => {
      batchTimer = null
      void flushClicks()
    }, 400)
  }
}

async function buyUpgrade(upgradeId: string) {
  if (!auth.user) { ui.toast(t('ui.s_need_login'), 'info'); return }
  try {
    const res = await api<any>('/api/v1/clicker/upgrade', { method: 'POST', json: true, body: { upgradeId } })
    coins.value = Number(res.coins)
    clickPower.value = Number(res.clickPower)
    autoPower.value = Number(res.autoPower)
    upgrades.value = res.upgrades
    setMsg('✓ Upgraded!', 'success')
    setTimeout(() => { message.value = '' }, 1800)
  } catch (e: any) {
    setMsg(e?.message ?? t('ui.s_error'), 'error')
  }
}

async function convert() {
  if (!auth.user) { ui.toast(t('ui.s_need_login'), 'info'); return }
  if (Number(coins.value) < Number(convertRate.value)) { setMsg(t('ui.s_clicker_convert_hint'), 'info'); return }
  try {
    const res = await api<any>('/api/v1/clicker/convert', { method: 'POST' })
    coins.value = Number(res.coinsLeft)
    await auth.fetchBalance({ force: true })
    setMsg(`+${fmtK(res.kCoinsEarned)} K`, 'success')
  } catch (e: any) { setMsg(e?.message ?? t('ui.s_error'), 'error') }
}

const upgradesByTier = computed(() => {
  const tiers: Record<number, any[]> = {}
  for (const u of upgradeList.value) {
    if (!tiers[u.tier]) tiers[u.tier] = []
    tiers[u.tier].push(u)
  }
  return Object.entries(tiers).map(([tier, list]) => ({ tier: Number(tier), list }))
})

const TIER_COLORS: Record<number, string> = {
  1: '#9ca3af', 2: '#34d399', 3: '#3b82f6', 4: '#a855f7', 5: '#f59e0b', 6: '#ec4899',
}

// Auto tick (visual only — server accumulates real coins via last_auto_at)
let autoTimer: number | null = null
onMounted(async () => {
  await fetchState()
  autoTimer = window.setInterval(() => {
    if (auth.user && autoPower.value > 0) {
      coins.value = Number(coins.value) + Number(autoPower.value)
    }
  }, 1000)
})
onBeforeUnmount(() => {
  if (autoTimer) clearInterval(autoTimer)
  if (batchTimer) { clearTimeout(batchTimer); void flushClicks() }
})
</script>

<template>
  <div class="clicker-page">
    <!-- ─── Left: stats + convert ─────────────────────── -->
    <aside class="c-panel c-left">
      <div class="coin-stats">
        <div class="stat-lbl muted">{{ $t('ui.s_clicker_coins') }}</div>
        <div class="coins-big">{{ fmt(coins) }} <span class="c-ic">🪙</span></div>
        <div class="stat-row"><span class="muted small">{{ $t('ui.s_clicker_click_power', { n: clickPower }) }}</span></div>
        <div class="stat-row" v-if="autoPower > 0"><span class="muted small">{{ $t('ui.s_clicker_auto', { n: autoPower }) }}</span></div>
      </div>

      <div class="sep" />

      <button class="btn btn-primary cvt-btn" @click="convert" :disabled="Number(coins) < Number(convertRate)">
        {{ $t('ui.s_clicker_convert') }}
      </button>
      <div class="muted small cvt-hint">{{ $t('ui.s_clicker_convert_hint') }}</div>

      <div v-if="message" class="msg-box" :class="messageType">{{ message }}</div>
    </aside>

    <!-- ─── Center: click coin ───────────────────────── -->
    <div class="c-center c-panel">
      <div class="click-zone">
        <div class="click-outer" @click="click">
          <!-- Coin with dynamic skin -->
          <div
            class="click-coin"
            :class="{ bump: clickAnim, cosmos: isCosmos, dragon: isDragon, phoenix: isPhoenix, void: isVoid, shadow: isShadow, sapphire: isSapphire }"
            @animationend="clickAnim = false"
          >
            <!-- Cosmos stars -->
            <template v-if="isCosmos">
              <div v-for="s in 20" :key="s" class="star" :style="{ '--a': s * 18 + 'deg', '--d': (0.3 + Math.random() * 0.7).toFixed(2) + 's', '--r': (25 + Math.random() * 40) + '%' }" />
            </template>
            <!-- Dragon fire -->
            <div v-if="isDragon" class="dragon-fire" />
            <!-- Phoenix halo -->
            <div v-if="isPhoenix" class="phoenix-halo" />
            <!-- Void swirl -->
            <div v-if="isVoid" class="void-swirl" />
            <!-- Coin face -->
            <div class="coin-face">
              <span class="glyph">{{ isCosmos ? '🌌' : isDragon ? '🐉' : isPhoenix ? '🔥' : 'K' }}</span>
              <div class="coin-ring" />
            </div>
          </div>

          <!-- Robot beaters -->
          <div class="robots" v-if="robotCount > 0">
            <div v-for="i in robotCount" :key="i" class="robot" :style="{ '--ri': i, '--rtotal': robotCount }">
              🤖
            </div>
          </div>
        </div>

        <!-- Particles -->
        <div class="particle-host" aria-hidden="true">
          <div v-for="p in clickParticles" :key="p.id" class="particle"
            :style="{ left: p.x + '%', top: p.y + '%' }">
            +{{ p.val }}
          </div>
        </div>

        <div class="click-label">{{ $t('ui.s_clicker_click_btn') }}</div>
        <div class="click-sub muted small">+{{ clickPower }} {{ $t('ui.s_clicker_per_click') }}</div>
      </div>
    </div>

    <!-- ─── Right: upgrades ──────────────────────────── -->
    <aside class="c-panel c-right">
      <div class="upg-header">
        <span class="upg-title">{{ $t('ui.s_clicker_upgrades') }}</span>
      </div>

      <div v-for="group in upgradesByTier" :key="group.tier" class="upg-group">
        <div class="tier-label" :style="{ color: TIER_COLORS[group.tier] }">
          {{ $t(`ui.s_clicker_tier_${group.tier}`, `Tier ${group.tier}`) }}
        </div>
        <div
          v-for="u in group.list"
          :key="u.id"
          class="upg-card"
          :class="{ maxed: isMaxed(u), affordable: !isMaxed(u) && canAffordCoin(u) }"
          :style="{ '--tc': TIER_COLORS[u.tier] }"
        >
          <div class="upg-top">
            <div class="upg-name">{{ upgName(u) }}</div>
            <div class="upg-level muted small">{{ getLevel(u.id) }}/{{ u.maxLevel }}</div>
          </div>
          <div class="upg-desc muted small">{{ upgDesc(u) }}</div>
          <div class="upg-bonus muted small">
            <span v-if="u.clickBonus">+{{ u.clickBonus }}/click</span>
            <span v-if="u.autoBonus">+{{ u.autoBonus }}/sec</span>
          </div>
          <button
            class="btn upg-btn"
            :class="{ 'btn-primary': !isMaxed(u) && canAffordCoin(u) }"
            :disabled="isMaxed(u)"
            @click="buyUpgrade(u.id)"
          >
            <span v-if="isMaxed(u)">{{ $t('ui.s_clicker_maxed') }}</span>
            <span v-else>{{ upgCostLabel(u) }}</span>
          </button>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.clicker-page {
  display: grid;
  grid-template-columns: 200px 1fr 340px;
  gap: 10px;
  padding: 12px;
  min-height: calc(100vh - 100px);
  align-items: start;
}
@media (max-width: 1100px) { .clicker-page { grid-template-columns: 1fr 320px; } .c-left { display: none; } }
@media (max-width: 760px) { .clicker-page { grid-template-columns: 1fr; } .c-right { order: -1; } }

.c-panel {
  background: rgba(0,0,0,.22);
  border: 1px solid rgba(255,255,255,.06);
  border-radius: 18px;
  padding: 16px;
}
.muted { color: var(--muted); }
.small { font-size: 12px; }
.sep { height: 1px; background: rgba(255,255,255,.06); margin: 12px 0; }

/* Left */
.c-left { display: flex; flex-direction: column; gap: 10px; }
.stat-lbl { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 4px; }
.stat-row { }
.coins-big { font-size: 24px; font-weight: 1000; color: #ffd700; display: flex; align-items: center; gap: 8px; }
.c-ic { font-size: 20px; }
.cvt-btn { width: 100%; height: 42px; border-radius: 12px; }
.cvt-hint { font-size: 11px; margin-top: 4px; }
.msg-box { padding: 8px 12px; border-radius: 10px; font-size: 12px; border: 1px solid rgba(255,255,255,.08); margin-top: 8px; }
.msg-box.success { border-color: rgba(34,197,94,.35); background: rgba(34,197,94,.08); }
.msg-box.error { border-color: rgba(248,81,73,.35); background: rgba(248,81,73,.08); }
.msg-box.info { }

/* Center */
.c-center { display: flex; align-items: center; justify-content: center; min-height: 480px; }
.click-zone { position: relative; display: flex; flex-direction: column; align-items: center; gap: 14px; }
.click-outer { position: relative; cursor: pointer; user-select: none; display: flex; align-items: center; justify-content: center; }
.click-outer:hover .click-coin { transform: scale(1.04); }
.click-outer:active .click-coin { transform: scale(0.96); }

/* Coin base */
.click-coin {
  width: 190px; height: 190px; border-radius: 999px;
  background: radial-gradient(circle at 35% 30%, rgba(255,255,255,.22), rgba(0,0,0,.40) 60%), radial-gradient(circle at 65% 70%, rgba(255,210,80,.20), transparent 55%);
  border: 3px solid rgba(255,210,80,.50);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 0 50px rgba(255,210,80,.20), inset 0 0 0 2px rgba(255,255,255,.06);
  transition: transform 80ms ease, box-shadow 80ms ease;
  position: relative; overflow: hidden;
}
.click-coin.bump { animation: coinBump 120ms ease-out; }
@keyframes coinBump { 0%{ transform: scale(1); } 45%{ transform: scale(0.91); } 100%{ transform: scale(1); } }

/* Cosmos skin */
.click-coin.cosmos {
  background: radial-gradient(circle at 50% 50%, #0a0a2e, #06041a);
  border-color: rgba(100,100,255,.7);
  box-shadow: 0 0 60px rgba(80,80,255,.35), 0 0 20px rgba(200,100,255,.25);
}
.star {
  position: absolute;
  width: 3px; height: 3px; border-radius: 999px;
  background: white;
  top: 50%; left: 50%;
  transform: rotate(var(--a)) translateX(var(--r));
  animation: twinkle var(--d) ease-in-out infinite alternate;
}
@keyframes twinkle { 0%{ opacity:.2; } 100%{ opacity:1; } }

/* Dragon skin */
.click-coin.dragon {
  background: radial-gradient(circle at 50% 50%, #1a0500, #0d0200);
  border-color: rgba(255,80,0,.7);
  box-shadow: 0 0 60px rgba(255,80,0,.35);
}
.dragon-fire {
  position: absolute; inset: -10px; border-radius: 999px;
  background: conic-gradient(from 0deg, transparent, rgba(255,80,0,.18), transparent, rgba(255,140,0,.14), transparent);
  animation: spinFire 3s linear infinite;
}
@keyframes spinFire { to{ transform: rotate(360deg); } }

/* Phoenix skin */
.click-coin.phoenix {
  background: radial-gradient(circle at 50% 50%, #1a0d00, #0d0600);
  border-color: rgba(255,178,74,.8);
  box-shadow: 0 0 70px rgba(255,178,74,.40);
}
.phoenix-halo {
  position: absolute; inset: -8px; border-radius: 999px;
  border: 2px solid rgba(255,178,74,.4);
  animation: haloBreath 2s ease-in-out infinite;
}
@keyframes haloBreath { 0%,100%{ opacity:.4; transform: scale(1); } 50%{ opacity:.9; transform: scale(1.04); } }

/* Void skin */
.click-coin.void {
  background: radial-gradient(circle at 50% 50%, #070010, #020004);
  border-color: rgba(168,85,247,.7);
  box-shadow: 0 0 60px rgba(168,85,247,.35);
}
.void-swirl {
  position: absolute; inset: 10px; border-radius: 999px;
  background: conic-gradient(from 0deg, transparent, rgba(168,85,247,.15), transparent, rgba(100,0,200,.12), transparent);
  animation: spinFire 6s linear infinite reverse;
}

/* Shadow skin */
.click-coin.shadow {
  background: radial-gradient(circle at 50% 50%, #0a0010, #030006);
  border-color: rgba(50,0,100,.7);
  box-shadow: 0 0 40px rgba(80,0,180,.3);
}

/* Sapphire glow */
.click-coin.sapphire {
  box-shadow: 0 0 60px rgba(59,130,246,.35), 0 0 20px rgba(100,180,255,.2);
  border-color: rgba(59,130,246,.7);
}

.coin-face { position: relative; z-index: 2; display: flex; align-items: center; justify-content: center; }
.glyph { font-size: 66px; font-weight: 1200; color: #ffd700; text-shadow: 0 4px 18px rgba(0,0,0,.7); }
.coin-ring { position: absolute; inset: -60px; border-radius: 999px; border: 2px solid rgba(255,210,80,.20); pointer-events: none; }

/* Robots */
.robots { position: absolute; inset: 0; pointer-events: none; }
.robot {
  position: absolute;
  font-size: 28px;
  /* Place robots around the coin at angles */
  top: 50%; left: 50%;
  transform-origin: -95px 0;
  transform: rotate(calc(360deg / var(--rtotal) * var(--ri))) translateX(-95px);
  animation: robotBeat 1.2s ease-in-out infinite;
  animation-delay: calc(0.3s * var(--ri));
}
@keyframes robotBeat {
  0%,100% { filter: none; }
  50% { filter: drop-shadow(0 0 8px rgba(100,255,100,.8)); transform: rotate(calc(360deg / var(--rtotal) * var(--ri))) translateX(-95px) scale(1.15); }
}

.particle-host { position: absolute; inset: 0; pointer-events: none; overflow: visible; }
.particle {
  position: absolute; font-weight: 1000; font-size: 16px; color: #ffd700;
  animation: particleUp 700ms ease-out forwards; pointer-events: none; white-space: nowrap;
  text-shadow: 0 2px 8px rgba(0,0,0,.7);
}
@keyframes particleUp { 0%{ opacity:1; transform: translateY(0) scale(1.1); } 100%{ opacity:0; transform: translateY(-55px) scale(0.8); } }

.click-label { font-size: 14px; font-weight: 900; letter-spacing: 2px; color: rgba(255,255,255,.65); }
.click-sub { }

/* Right — upgrades (larger panel) */
.c-right {
  display: flex; flex-direction: column; gap: 10px;
  overflow-y: auto; max-height: calc(100vh - 120px);
}
.c-right::-webkit-scrollbar { width: 6px; }
.c-right::-webkit-scrollbar-thumb { background: rgba(255,255,255,.08); border-radius: 999px; }
.upg-header { display: flex; align-items: center; justify-content: space-between; }
.upg-title { font-weight: 1000; font-size: 16px; }
.upg-group { display: flex; flex-direction: column; gap: 6px; }
.tier-label { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .5px; padding: 4px 0 2px; border-bottom: 1px solid rgba(255,255,255,.04); margin-bottom: 2px; }
.upg-card {
  border: 1px solid color-mix(in srgb, var(--tc, #9ca3af) 18%, transparent);
  background: rgba(0,0,0,.18); border-radius: 14px; padding: 12px;
  display: flex; flex-direction: column; gap: 5px;
  transition: border-color 150ms, background 150ms;
}
.upg-card.affordable { border-color: color-mix(in srgb, var(--tc, #9ca3af) 45%, transparent); background: color-mix(in srgb, var(--tc, #9ca3af) 5%, transparent); }
.upg-card.maxed { opacity: .4; }
.upg-top { display: flex; align-items: center; justify-content: space-between; }
.upg-name { font-weight: 900; font-size: 13px; }
.upg-level { font-size: 11px; }
.upg-desc { font-size: 11px; }
.upg-bonus { display: flex; gap: 8px; font-size: 11px; color: rgba(255,255,255,.45); }
.upg-btn { height: 34px; border-radius: 10px; font-size: 12px; width: 100%; margin-top: 4px; }
</style>
