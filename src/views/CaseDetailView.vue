<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'
import { useAuthStore } from '../stores/auth'
import { useBigWinStore } from '../stores/bigwin'
import { sfx } from '../utils/sfx'
import { formatNumber } from '../utils/format'

type ReelItem = { label: string; amount: number; icon: string }

const route = useRoute()
const game = useGameStore()
const auth = useAuthStore()
const bigwinStore = useBigWinStore()
const { t } = useI18n()

const c = computed(() => game.cases.find(x => x.id === String(route.params.id)))

const opening = ref(false)
const message = ref('')

const fmt = (v: number | string, d = 2) => formatNumber(v, d)

const items = ref<ReelItem[]>([])
const result = ref<string | null>(null)
const resultAmount = ref<number | null>(null)
const winIndexRef = ref<number | null>(null)

const jackpotFxTick = ref(0)
const jackpotKind = ref<'legendary' | 'epic' | 'rare' | 'common'>('common')
function triggerJackpotFx(amount: number) {
  jackpotKind.value = rarity(amount) as any
  jackpotFxTick.value += 1
}

const reelEl = ref<HTMLElement | null>(null)
const stripEl = ref<HTMLElement | null>(null)

const CHIP_W = 120
const GAP = 10
const PAD = 40

const animDurationSingle = Math.round(7800 * 1.15)
const animEasing = 'cubic-bezier(.15,.9,.2,1)'

const quickOpen = ref(false)
const QUICK_KEY = 'cases_quick_open'

function waitFrame(){
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}
async function waitFrames(n = 2){
  for(let i=0;i<n;i++) await waitFrame()
}

function rarity(amount: number){
  if(amount >= 2000000) return 'mythic'
  if(amount >= 250000) return 'legendary'
  if(amount >= 45000)  return 'epic'
  if(amount >= 8000)   return 'rare'
  if(amount >= 1200)   return 'uncommon'
  return 'common'
}
function lootIcon(l: any){
  if(l?.icon) return l.icon
  const a = typeof l === 'number' ? l : (l?.amount ?? 0)
  if(a >= 2000000) return '✨'
  if(a >= 250000)  return '⚜️'
  if(a >= 45000)   return '🔮'
  if(a >= 8000)    return '💎'
  if(a >= 1200)    return '💚'
  return '🪙'
}

function pickLootWeighted(): ReelItem {
  const loot = c.value?.loot ?? []
  if (!loot.length) return { label: t('ui.s_case_zero_win'), amount: 0, icon: '🪙' }

  const sum = loot.reduce((a, x) => a + (x.chance ?? 0), 0) || 1
  let r = Math.random() * sum
  for(const l of loot){
    r -= (l.chance ?? 0)
    if(r <= 0){
      return { label: l.label, amount: l.amount, icon: lootIcon(l.amount) }
    }
  }
  const last = loot[loot.length - 1]
  return { label: last.label, amount: last.amount, icon: lootIcon(last.amount) }
}

function buildStrip(winItem: ReelItem){
  const total = 70
  const winIndex = 52

  const arr = Array.from({ length: total }, () => pickLootWeighted())
  arr[winIndex] = winItem
  arr[winIndex - 2] = pickLootWeighted()
  arr[winIndex + 2] = pickLootWeighted()

  items.value = arr
  winIndexRef.value = winIndex
  return { winIndex }
}

function buildQuickStrip(winItem: ReelItem){
  const SIDE = 6
  const arr: ReelItem[] = []

  for(let i = 0; i < SIDE; i++) arr.push(pickLootWeighted())
  arr.push(winItem)
  for(let i = 0; i < SIDE; i++) arr.push(pickLootWeighted())

  const winIndex = SIDE

  items.value = arr
  winIndexRef.value = winIndex
  return { winIndex }
}

function computeTargetX(winIndex: number){
  const reel = reelEl.value
  if(!reel) return 0
  const center = reel.clientWidth / 2
  const winCenterX = PAD + winIndex * (CHIP_W + GAP) + CHIP_W / 2
  return -(winCenterX - center)
}

let cleanupTimer: number | null = null
let transitionFallback: number | null = null
function clearCleanup(){
  if(cleanupTimer !== null){
    clearTimeout(cleanupTimer)
    cleanupTimer = null
  }
  if(transitionFallback !== null){
    clearTimeout(transitionFallback)
    transitionFallback = null
  }
}
onBeforeUnmount(() => clearCleanup())

function hardResetStrip(){
  const el = stripEl.value
  if(!el) return

  clearCleanup()

  el.style.transition = 'none'
  el.style.transform = 'translate3d(0,0,0)'

  void el.offsetHeight

  el.style.willChange = 'transform'
}

function snapToX(x: number){
  const el = stripEl.value
  if(!el) return
  clearCleanup()
  el.style.transition = 'none'
  el.style.transform = `translate3d(${x}px,0,0)`
  void el.offsetHeight
  el.style.transition = ''
  el.style.willChange = ''
}

function animateToX(x: number, durationMs: number, easing: string){
  return new Promise<void>((resolve) => {
    const el = stripEl.value
    if(!el){ resolve(); return }

    let done = false
    const finish = () => {
      if(done) return
      done = true
      el.removeEventListener('transitionend', onEnd)
      if(transitionFallback !== null){
        clearTimeout(transitionFallback)
        transitionFallback = null
      }
      el.style.transition = ''
      el.style.willChange = ''
      resolve()
    }

    const onEnd = (e: Event) => {
      if(e.target !== el) return
      finish()
    }

    el.addEventListener('transitionend', onEnd)

    el.style.transition = `transform ${durationMs}ms ${easing}`
    requestAnimationFrame(() => {
      el.style.transform = `translate3d(${x}px,0,0)`
    })

    transitionFallback = window.setTimeout(() => {
      finish()
    }, durationMs + 120)
  })
}

async function openOne(){
  message.value = ''
  result.value = null
  resultAmount.value = null

  if (!c.value) {
    message.value = t('ui.s_case_not_found')
    return
  }
  if (!auth.user) {
    message.value = t('ui.s_need_login')
    return
  }
  if (auth.user.balance < c.value.price) {
    message.value = t('ui.s_insufficient_balance_need', { a: fmt(c.value.price, 0) })
    return
  }

  opening.value = true

  const res = await game.openCase(c.value.id)
  if (!res.ok) {
    opening.value = false
    if (res.error === 'need_login') message.value = t('ui.s_need_login')
    else message.value = res.message || t('ui.s_error')
    return
  }

  const wLabel = res.loot?.label || '—'
  const wAmount = res.loot?.amount ?? 0

  bigwinStore.maybeShow(Number(wAmount) || 0, c.value.price)

  if (wAmount >= 350) triggerJackpotFx(wAmount)

  const winItem: ReelItem = { label: wLabel, amount: wAmount, icon: lootIcon(wAmount) }

  if(quickOpen.value){
    const { winIndex } = buildQuickStrip(winItem)
    await nextTick()

    const x = computeTargetX(winIndex)
    snapToX(x)

    sfx('case_stop')
    sfx('win')
    result.value = wLabel
    resultAmount.value = wAmount
    if (wAmount >= 120) triggerJackpotFx(wAmount)
    opening.value = false
    return
  }

  const { winIndex } = buildStrip(winItem)
  await nextTick()

  hardResetStrip()
  await waitFrames(2)

  const target = computeTargetX(winIndex)
  const overshoot = target - 28

  sfx('case_spin')

  await animateToX(overshoot, Math.max(600, animDurationSingle - 420), animEasing)
  await animateToX(target, 420, 'cubic-bezier(.2,.9,.2,1)')

  sfx('case_stop')
  sfx('win')

  result.value = wLabel
  resultAmount.value = wAmount
  if (wAmount >= 120) triggerJackpotFx(wAmount)
  opening.value = false
}

onMounted(() => {
  game.loadCases().catch(() => {})
  try{
    quickOpen.value = localStorage.getItem(QUICK_KEY) === '1'
  }catch{}
})

watch(quickOpen, (v) => {
  try{
    localStorage.setItem(QUICK_KEY, v ? '1' : '0')
  }catch{}
})
</script>

<template>
  <div class="app-page">
    <div v-if="!c && game.casesLoading" class="game-card pad">{{ $t('ui.s_e0760be2bf') }}</div>

    <div v-else-if="!c" class="game-card pad">{{ $t('ui.s_6dcc0e58a7') }}</div>

    <div v-else class="game-card case-layout">
      <div class="left-panel">
        <div class="top">
          <div class="badge">CASE</div>
          <h2 class="title">{{ c.name }}</h2>
          <div class="price">{{ fmt(c.price, 0) }} <span class="coin">K</span></div>
        </div>

        <div class="model">
          <img class="case-ic" :src="`/icon/${c.id}.png`" :alt="c.name" />
        </div>

        <label class="toggle">
          <input type="checkbox" v-model="quickOpen" :disabled="opening" />
          <span class="tbox" aria-hidden="true"></span>
          <span class="ttext">{{ $t('ui.s_179b3c4123') }}</span>
        </label>

        <div class="btn-row">
          <button class="primary" :disabled="opening" @click="openOne">
            {{ opening ? $t('ui.s_case_opening') : $t('ui.s_case_open') }}
          </button>
        </div>

        <div class="status">
          <span v-if="result" class="pill ok">{{ $t('ui.s_case_dropped', { r: result, a: fmt(resultAmount ?? 0, 0) }) }}</span>
          <span v-else-if="message" class="pill err">{{ message }}</span>
          <span v-else class="pill muted">{{ $t('ui.s_bc3db5d2b8') }}</span>
        </div>

      </div>

      <div class="main-panel">
        <div class="reel-wrap" :class="{ opening }">
          <div class="reel" ref="reelEl">
            <div class="window"></div>
            <div class="shine" v-if="opening && !quickOpen"></div>
            <div v-if="jackpotFxTick && !opening" class="jackpot-fx" :key="`jf-${jackpotFxTick}`" :class="jackpotKind" aria-hidden="true">
              <div class="jf-rays"></div>
              <div class="jf-burst"></div>
            </div>

            <div class="strip" ref="stripEl">
              <div class="slot" v-for="(it, idx) in items" :key="idx">
                <div class="flip" :class="{ reveal: !!result && !opening && idx === winIndexRef }">
                  <div class="face front">
                    <div class="ic" aria-hidden="true">{{ it.icon }}</div>
                  </div>
                  <div class="face back">
                    <div class="ic">{{ it.icon }}</div>
                    <div class="lab back-label">{{ it.label }}</div>
                    <div class="back-amt">+{{ it.amount }} K</div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        <div class="loot">
          <div class="loot-head">
            <div class="muted"><b>{{ $t('ui.s_544eb8623d') }}</b></div>
          </div>
          <div class="loot-grid">
            <div class="loot-row" v-for="l in c.loot" :key="l.id" :class="rarity(l.amount)">
              <div class="l-left">
                <div class="lic" aria-hidden="true">{{ lootIcon(l) }}</div>
                <div class="label">{{ l.label }}</div>
              </div>
              <div class="meta">
                <div class="amt">+{{ l.amount }}</div>
                <div class="chance">{{ Math.round(l.chance * 100) }}%</div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
.app-page{ padding: 18px 8px 34px; }
.game-card{
  background:
    radial-gradient(1200px 520px at 40% 0%, rgba(61,255,157,.10), transparent 58%),
    radial-gradient(900px 520px at 95% 10%, rgba(255,178,74,.14), transparent 62%),
    rgba(20,20,15,.74);
  border: 1px solid rgba(255,255,255,.06);
  border-radius: 18px;
  box-shadow: 0 18px 40px rgba(0,0,0,.35);
  overflow: hidden;
  position: relative;
  min-height: 660px;
}
.pad{ padding: 18px; color: rgba(255,255,255,.9); }
.case-layout{ display:flex; }
.left-panel{
  width: 340px;
  padding: 18px;
  border-right: 1px solid rgba(255,178,74,.10);
  background: rgba(10,10,7,.58);
  display:flex;
  flex-direction: column;
  gap: 14px;
}
.top{ display:flex; flex-direction: column; gap: 8px; }
.badge{
  align-self: flex-start;
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.10);
  background: rgba(255,255,255,.04);
  color: rgba(255,255,255,.82);
  font-weight: 900;
  letter-spacing: .08em;
}
.title{ margin:0; color: rgba(255,248,236,.92); }
.price{ color: rgba(255,255,255,.75); font-weight: 900; display:flex; align-items:center; gap: 8px; }

.model{
  border: 1px solid rgba(255,255,255,.08);
  background: rgba(255,255,255,.03);
  border-radius: 16px;
  padding: 14px;
  text-align:center;
}
.case-ic{ width: 116px; height: 116px; display:block; margin: 0 auto; object-fit: contain; filter: drop-shadow(0 18px 26px rgba(0,0,0,.45)); }
.muted{ color: rgba(255,255,255,.68); }
.small{ font-size: 12px; opacity: .85; }

.btn-row{ display:flex; gap: 10px; }
.primary{
  flex: 1;
  border:0;
  padding: 14px 12px;
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(255,178,74,1), rgba(255,122,24,1));
  color: rgba(20,15,8,.96);
  font-weight: 1000;
  cursor:pointer;
  box-shadow: 0 10px 26px rgba(255,122,24,.18), 0 0 22px rgba(255,178,74,.14);
}
.primary:disabled{ opacity:.55; cursor:not-allowed; }

.toggle{
  display:flex;
  align-items:center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,.08);
  background: rgba(255,255,255,.03);
  cursor: pointer;
  user-select: none;
}
.toggle input{ display:none; }
.tbox{
  width: 44px;
  height: 26px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.12);
  background: rgba(255,255,255,.05);
  position: relative;
}
.tbox::after{
  content:'';
  width: 20px;
  height: 20px;
  border-radius: 999px;
  position:absolute;
  top: 50%;
  left: 3px;
  transform: translateY(-50%);
  background: rgba(255,255,255,.85);
  transition: left .14s ease, background .14s ease;
}
.toggle input:checked + .tbox{
  background: rgba(61,255,157,.14);
  border-color: rgba(61,255,157,.30);
}
.toggle input:checked + .tbox::after{
  left: 21px;
  background: rgba(61,255,157,.92);
}
.ttext{ font-weight: 900; color: rgba(255,255,255,.86); }

.status{ display:flex; flex-direction: column; gap: 8px; }
.pill{
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,.08);
  background: rgba(255,255,255,.03);
  color: rgba(255,255,255,.82);
  font-weight: 800;
}
.pill.ok{ border-color: rgba(61,255,157,.35); background: rgba(61,255,157,.10); }
.pill.err{ border-color: rgba(248,81,73,.45); background: rgba(248,81,73,.10); }
.pill.muted{ opacity:.85; }

.main-panel{ flex:1; padding: 18px; position: relative; }

.reel-wrap{
  border: 1px solid rgba(255,255,255,.06);
  background: rgba(255,255,255,.03);
  border-radius: 16px;
  padding: 14px;
}
.reel{
  position: relative;
  height: 140px;
  border-radius: 14px;
  overflow: hidden;
  background: rgba(0,0,0,.18);
}
.window{
  position:absolute;
  top: 0; bottom: 0;
  left: 50%;
  width: 120px;
  transform: translateX(-50%);
  border-left: 2px solid rgba(255,178,74,.38);
  border-right: 2px solid rgba(255,178,74,.38);
  box-shadow: 0 0 26px rgba(255,122,24,.18);
  pointer-events:none;
}

.strip{
  position:absolute;
  left: 0; top: 0;
  height: 100%;
  display:flex;
  align-items:center;
  gap: 10px;
  padding: 0 40px;
  transform: translate3d(0,0,0);
  will-change: transform;
}
.slot{
  width: 120px;
  height: 100px;
  display:grid;
  place-items:center;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,.08);
  background: rgba(255,255,255,.04);
  perspective: 800px;
}
.flip{
  width: 100%;
  height: 100%;
  position: relative;
  transform-style: preserve-3d;
  transition: transform 420ms ease;
}
.flip.reveal{ transform: rotateY(180deg); }
.face{
  position:absolute;
  inset:0;
  backface-visibility: hidden;
  display:grid;
  place-items:center;
}
.face.front{ transform: rotateY(0deg); }
.face.back{
  transform: rotateY(180deg);
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 2px;
  background: radial-gradient(circle at 50% 40%, rgba(255,215,0,.08), transparent 70%);
  border-radius: 14px;
}
.ic{ font-size: 34px; filter: drop-shadow(0 10px 18px rgba(0,0,0,.35)); }
.amt{ font-weight: 1100; font-size: 18px; color: rgba(234,243,255,.95); }
.lab{ font-weight: 900; font-size: 11px; color: rgba(255,255,255,.70); margin-top: -2px; }
.face.back .ic{ font-size: 24px; }
.back-label{
  font-size: 10.5px; font-weight: 900; color: rgba(255,255,255,.9);
  text-align: center; padding: 0 6px; line-height: 1.3;
  max-width: 110px; word-break: break-word;
}
.back-amt{ font-size: 11px; font-weight: 900; color: rgba(255,215,0,.85); }

.loot{ margin-top: 14px; }
.loot-head{ margin-bottom: 10px; }
.loot-grid{
  display:grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}
.loot-row{
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid rgba(255,255,255,.08);
  background: rgba(255,255,255,.03);
  border-radius: 12px;
  padding: 10px 12px;
}
.loot-row.common{ border-color: rgba(255,255,255,.08); }
.loot-row.uncommon{ border-color: rgba(52,211,153,.28); box-shadow: 0 0 0 1px rgba(52,211,153,.10); }
.loot-row.rare{ border-color: rgba(59,130,246,.35); box-shadow: 0 0 0 1px rgba(59,130,246,.14); }
.loot-row.epic{ border-color: rgba(168,85,247,.35); box-shadow: 0 0 0 1px rgba(168,85,247,.14); }
.loot-row.legendary{ border-color: rgba(245,158,11,.38); box-shadow: 0 0 0 1px rgba(245,158,11,.15); }
.loot-row.mythic{ border-color: rgba(236,72,153,.40); box-shadow: 0 0 0 1px rgba(236,72,153,.18); animation: mythicPulse 2.5s ease-in-out infinite; }
@keyframes mythicPulse{ 0%,100%{ box-shadow: 0 0 0 1px rgba(236,72,153,.18); } 50%{ box-shadow: 0 0 8px rgba(236,72,153,.35), 0 0 0 1px rgba(236,72,153,.30); } }

.l-left{ display:flex; align-items:center; gap: 10px; }
.lic{
  width: 34px; height: 34px;
  border-radius: 12px; display:grid; place-items:center;
  border: 1px solid rgba(255,255,255,.10);
  background: rgba(255,255,255,.04);
  filter: drop-shadow(0 10px 18px rgba(0,0,0,.28));
}
.label{ font-weight: 1000; color: rgba(255,255,255,.88); }
.meta{ display:flex; align-items:center; gap: 10px; }
.chance{
  font-weight: 900;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.10);
  background: rgba(255,255,255,.04);
  color: rgba(255,255,255,.80);
}

.reel-wrap.opening .strip{ filter: blur(0.6px); }
.shine{
  position:absolute;
  inset:-40%;
  background: linear-gradient(120deg, transparent 35%, rgba(255,255,255,.10) 50%, transparent 65%);
  animation: shineSweep 900ms linear infinite;
  pointer-events:none;
}
@keyframes shineSweep{
  0%{ transform: translateX(-30%) rotate(12deg); opacity:.0;}
  15%{opacity:.6}
  100%{ transform: translateX(30%) rotate(12deg); opacity:0;}
}

.jackpot-fx{
  position:absolute;
  inset:-40px;
  pointer-events:none;
  z-index: 4;
  opacity: 0;
  mix-blend-mode: screen;
}
.jackpot-fx.epic{ opacity:1; animation: jfIn 1100ms ease-out both; }
.jackpot-fx.legendary{ opacity:1; animation: jfIn 1400ms ease-out both; }
.jf-rays{
  position:absolute;
  inset:0;
  background: conic-gradient(from 90deg, transparent, rgba(255,208,90,.18), transparent, rgba(61,255,157,.14), transparent);
  filter: blur(0.4px);
  animation: jfRays 1200ms linear infinite;
  opacity: .85;
}
.jackpot-fx.epic .jf-rays{ background: conic-gradient(from 90deg, transparent, rgba(255,115,220,.20), transparent, rgba(120,120,255,.16), transparent); }
.jf-burst{
  position:absolute;
  inset:0;
  background: radial-gradient(circle at 50% 50%, rgba(255,255,255,.24), rgba(255,255,255,0) 62%), radial-gradient(circle at 50% 50%, rgba(255,208,90,.22), rgba(255,208,90,0) 72%);
  opacity: .0;
  animation: jfBurst 900ms ease-out both;
}
.jackpot-fx.epic .jf-burst{ background: radial-gradient(circle at 50% 50%, rgba(255,255,255,.22), rgba(255,255,255,0) 62%), radial-gradient(circle at 50% 50%, rgba(255,115,220,.22), rgba(255,115,220,0) 72%); }

@keyframes jfIn{
  0%{ opacity:0; transform: scale(.98); }
  15%{ opacity:1; transform: scale(1.01); }
  100%{ opacity:0; transform: scale(1.04); }
}
@keyframes jfRays{
  0%{ transform: rotate(0deg); }
  100%{ transform: rotate(360deg); }
}
@keyframes jfBurst{
  0%{ opacity:0; transform: scale(.92); }
  20%{ opacity:1; }
  100%{ opacity:0; transform: scale(1.06); }
}

@media (max-width: 860px) {
  .case-layout { flex-direction: column; }
  .left-panel { width: 100%; border-right: none; border-bottom: 1px solid rgba(255,178,74,.10); }
  .hist-list { max-height: 160px; }
  .loot-grid { grid-template-columns: 1fr; }
}
@media (max-width: 520px) {
  .app-page { padding: 10px 0 20px; }
  .main-panel { padding: 12px; }
  .left-panel { padding: 12px; }
  .reel-wrap { padding: 8px; }
}

.loot-row.legendary{
  position: relative;
  overflow: hidden;
}
.loot-row.legendary::after{
  content:'';
  position:absolute;
  inset:-40% -60%;
  background: linear-gradient(120deg, transparent 40%, rgba(255,208,90,.18) 52%, transparent 64%);
  transform: translateX(-20%) rotate(10deg);
  opacity:.0;
  animation: lootShine 2600ms ease-in-out infinite;
}
@keyframes lootShine{
  0%{ transform: translateX(-30%) rotate(10deg); opacity:0; }
  12%{ opacity:.55; }
  28%{ opacity:0; }
  100%{ transform: translateX(30%) rotate(10deg); opacity:0; }
}

</style>
