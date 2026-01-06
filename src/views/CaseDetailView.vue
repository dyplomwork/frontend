<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useGameStore } from '../stores/game'
import { useAuthStore } from '../stores/auth'
import { useBigWinStore } from '../stores/bigwin'
import { sfx } from '../utils/sfx'
import { formatNumber } from '../utils/format'

type ReelItem = { label: string; amount: number; icon: string }
type HistoryItem = { ts: number; label: string; amount: number }

const route = useRoute()
const game = useGameStore()
const auth = useAuthStore()
const bigwinStore = useBigWinStore()

const c = computed(() => game.cases.find(x => x.id === String(route.params.id)))

const opening = ref(false)
const message = ref('')

const fmt = (v: number | string, d = 2) => formatNumber(v, d)

const items = ref<ReelItem[]>([])
const result = ref<string | null>(null)
const resultAmount = ref<number | null>(null)
const winIndexRef = ref<number | null>(null)

const reelEl = ref<HTMLElement | null>(null)
const stripEl = ref<HTMLElement | null>(null)

const CHIP_W = 120
const GAP = 10
const PAD = 40

// ✅ +15% дольше
const animDurationSingle = Math.round(7800 * 1.15) // 8970ms
const animEasing = 'cubic-bezier(.15,.9,.2,1)'

// Quick Open toggle (persist)
const quickOpen = ref(false)
const QUICK_KEY = 'cases_quick_open'

// ---------- history (localStorage) ----------
const HISTORY_LIMIT = 20
const history = ref<HistoryItem[]>([])

function historyKey(caseId: string){
  return `case_history_${caseId}`
}
function loadHistory(){
  const id = c.value?.id
  if(!id) return
  try{
    const raw = localStorage.getItem(historyKey(id))
    history.value = raw ? (JSON.parse(raw) as HistoryItem[]) : []
  }catch{
    history.value = []
  }
}
function pushHistory(item: HistoryItem){
  const id = c.value?.id
  if(!id) return
  const next = [item, ...history.value].slice(0, HISTORY_LIMIT)
  history.value = next
  try{
    localStorage.setItem(historyKey(id), JSON.stringify(next))
  }catch{}
}
function clearHistory(){
  const id = c.value?.id
  if(!id) return
  history.value = []
  localStorage.removeItem(historyKey(id))
}

// при смене caseId — перезагрузить историю
watch(() => c.value?.id, () => loadHistory())

// ---------- utils ----------
function waitFrame(){
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}
async function waitFrames(n = 2){
  for(let i=0;i<n;i++) await waitFrame()
}

function rarity(amount: number){
  if(amount >= 1200) return 'legendary'
  if(amount >= 350) return 'epic'
  if(amount >= 120) return 'rare'
  return 'common'
}
function lootIcon(amount: number){
  if(amount >= 1200) return '💎'
  if(amount >= 350) return '👑'
  if(amount >= 120) return '🧪'
  if(amount >= 50) return '🎁'
  return '🪙'
}

function pickLootWeighted(): ReelItem {
  const loot = c.value?.loot ?? []
  if(!loot.length) return { label: '+0 credits', amount: 0, icon: '🪙' }

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

// обычная длинная лента для анимации
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
  arr.push(winItem) // центр
  for(let i = 0; i < SIDE; i++) arr.push(pickLootWeighted())

  const winIndex = SIDE // 6

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

// ✅ главный фикс: каждый запуск спина начинается с нуля
function hardResetStrip(){
  const el = stripEl.value
  if(!el) return

  clearCleanup()

  el.style.transition = 'none'
  el.style.transform = 'translate3d(0,0,0)'

  // force reflow
  void el.offsetHeight

  el.style.willChange = 'transform'
}

// ✅ делаем transform сразу (без анимации) — для Quick Open “как будто уже прокрутилось”
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

// ✅ надёжная анимация: transitionend + fallback-таймер
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
      // иногда прилетает transitionend от вложенных — фильтруем
      if(e.target !== el) return
      finish()
    }

    el.addEventListener('transitionend', onEnd)

    el.style.transition = `transform ${durationMs}ms ${easing}`
    requestAnimationFrame(() => {
      el.style.transform = `translate3d(${x}px,0,0)`
    })

    // fallback: если transitionend не пришел
    transitionFallback = window.setTimeout(() => {
      finish()
    }, durationMs + 120)
  })
}

// ---------- main ----------
async function openOne(){
  message.value = ''
  result.value = null
  resultAmount.value = null

  if(!c.value){ message.value='Кейс не найден'; return }
  if(!auth.user){ message.value='Нужен вход'; return }
  if(auth.user.balance < c.value.price){
    message.value = `Недостаточно кредитов (нужно ${c.value.price})`
    return
  }

  opening.value = true

  // честный результат до анимации
  const res = await game.openCase(c.value.id)
  if(!res.ok){
    opening.value = false
    message.value = res.message || 'Ошибка'
    return
  }

  const wLabel = res.loot?.label || '—'
  const wAmount = res.loot?.amount ?? 0

	// BIG/MEGA/SUPER overlay (global)
	bigwinStore.maybeShow(Number(wAmount) || 0, c.value.price)

  pushHistory({ ts: Date.now(), label: wLabel, amount: wAmount })

  const winItem: ReelItem = { label: wLabel, amount: wAmount, icon: lootIcon(wAmount) }

  // ✅ Quick Open: показать “готовую прокрутку” (5 карточек)
  if(quickOpen.value){
    const { winIndex } = buildQuickStrip(winItem)
    await nextTick()

    const x = computeTargetX(winIndex)
    snapToX(x)


    // маленький приятный флип (без прокрутки)
    sfx('case_stop')
    sfx('win')
    result.value = wLabel
    resultAmount.value = wAmount
    opening.value = false
    return
  }

  // обычная анимация (длиннее на 15%)
  const { winIndex } = buildStrip(winItem)
  await nextTick()

  hardResetStrip()
  await waitFrames(2)

  const target = computeTargetX(winIndex)
  const overshoot = target - 28

  sfx('case_spin')

  // overshoot -> settle
  await animateToX(overshoot, Math.max(600, animDurationSingle - 420), animEasing)
  await animateToX(target, 420, 'cubic-bezier(.2,.9,.2,1)')

  sfx('case_stop')
  sfx('win')

  result.value = wLabel
  resultAmount.value = wAmount
  opening.value = false
}

// init
onMounted(() => {
  game.loadCases().catch(() => {})
  try{
    quickOpen.value = localStorage.getItem(QUICK_KEY) === '1'
  }catch{}
  loadHistory()
})

// persist toggle
watch(quickOpen, (v) => {
  try{
    localStorage.setItem(QUICK_KEY, v ? '1' : '0')
  }catch{}
})
</script>

<template>
  <div class="stake-page">
    <div v-if="!c && game.casesLoading" class="game-card pad">Загрузка кейса...</div>

    <div v-else-if="!c" class="game-card pad">Кейс не найден</div>

    <div v-else class="game-card case-layout">
      <div class="left-panel">
        <div class="top">
          <div class="badge">CASE</div>
          <h2 class="title">{{ c.name }}</h2>
          <div class="price">{{ fmt(c.price, 0) }} <span class="coin">K</span></div>
        </div>

        <div class="model">
          <div class="emoji">{{ c.modelEmoji }}</div>
          <div class="muted">Модель кейса</div>
        </div>

        <label class="toggle">
          <input type="checkbox" v-model="quickOpen" :disabled="opening" />
          <span class="tbox" aria-hidden="true"></span>
          <span class="ttext">Quick open (без анимации)</span>
        </label>

        <div class="btn-row">
          <button class="primary" :disabled="opening" @click="openOne">
            {{ opening ? 'Opening...' : 'Open case' }}
          </button>
        </div>

        <div class="status">
          <span v-if="result" class="pill ok">Выпало: {{ result }} (+{{ resultAmount }})</span>
          <span v-else-if="message" class="pill err">{{ message }}</span>
          <span v-else class="pill muted">Баланс начисляется сразу</span>
        </div>

        <div class="hist">
          <div class="hist-head">
            <div class="muted"><b>History</b> <span class="small">({{ history.length }}/20)</span></div>
            <button class="tiny" :disabled="opening || !history.length" @click="clearHistory">Clear</button>
          </div>

          <div v-if="!history.length" class="hist-empty muted">Пока пусто</div>

          <div v-else class="hist-list">
            <div class="hist-row" v-for="h in history" :key="h.ts + '-' + h.amount">
              <div class="h-left">
                <div class="h-ic" aria-hidden="true">{{ lootIcon(h.amount) }}</div>
                <div class="h-lab">{{ h.label }}</div>
              </div>
              <div class="h-amt">+{{ h.amount }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="main-panel">
        <div class="reel-wrap" :class="{ opening }">
          <div class="reel" ref="reelEl">
            <div class="window"></div>
            <div class="shine" v-if="opening && !quickOpen"></div>

            <div class="strip" ref="stripEl">
              <div class="slot" v-for="(it, idx) in items" :key="idx">
                <div class="flip" :class="{ reveal: !!result && !opening && idx === winIndexRef }">
                  <div class="face front">
                    <div class="ic" aria-hidden="true">{{ it.icon }}</div>
                  </div>
                  <div class="face back">
                    <div class="amt">+{{ it.amount }}</div>
                    <div class="lab">credits</div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        <div class="loot">
          <div class="loot-head">
            <div class="muted"><b>Лут кейса</b></div>
          </div>
          <div class="loot-grid">
            <div class="loot-row" v-for="l in c.loot" :key="l.id" :class="rarity(l.amount)">
              <div class="l-left">
                <div class="lic" aria-hidden="true">{{ lootIcon(l.amount) }}</div>
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
.stake-page{ padding: 18px 8px 34px; }
.game-card{
  background: rgba(14,26,36,.72);
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
  border-right: 1px solid rgba(255,255,255,.06);
  background: rgba(10,20,28,.55);
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
.title{ margin:0; color: #eaf3ff; }
.price{ color: rgba(255,255,255,.75); font-weight: 900; display:flex; align-items:center; gap: 8px; }

.model{
  border: 1px solid rgba(255,255,255,.08);
  background: rgba(255,255,255,.03);
  border-radius: 16px;
  padding: 14px;
  text-align:center;
}
.emoji{ font-size: 88px; line-height: 1; filter: drop-shadow(0 14px 20px rgba(0,0,0,.35)); }
.muted{ color: rgba(255,255,255,.68); }
.small{ font-size: 12px; opacity: .85; }

.btn-row{ display:flex; gap: 10px; }
.primary{
  flex: 1;
  border:0;
  padding: 14px 12px;
  border-radius: 12px;
  background: #15d24a;
  color: #07130c;
  font-weight: 1000;
  cursor:pointer;
  box-shadow: 0 10px 26px rgba(21,210,74,.18);
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
  background: rgba(21,210,74,.16);
  border-color: rgba(21,210,74,.28);
}
.toggle input:checked + .tbox::after{
  left: 21px;
  background: #15d24a;
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
.pill.ok{ border-color: rgba(21,210,74,.35); background: rgba(21,210,74,.10); }
.pill.err{ border-color: rgba(248,81,73,.45); background: rgba(248,81,73,.10); }
.pill.muted{ opacity:.85; }

.hist{
  margin-top: 4px;
  border: 1px solid rgba(255,255,255,.08);
  background: rgba(255,255,255,.03);
  border-radius: 16px;
  padding: 12px;
}
.hist-head{
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}
.tiny{
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,.10);
  background: rgba(255,255,255,.04);
  color: rgba(255,255,255,.85);
  padding: 8px 10px;
  font-weight: 900;
  cursor:pointer;
}
.tiny:disabled{ opacity:.55; cursor:not-allowed; }

.hist-empty{ padding: 8px 0; }
.hist-list{ display:flex; flex-direction: column; gap: 8px; max-height: 260px; overflow:auto; padding-right: 4px; }
.hist-row{
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid rgba(255,255,255,.08);
  background: rgba(0,0,0,.12);
  border-radius: 12px;
  padding: 8px 10px;
}
.h-left{ display:flex; align-items:center; gap: 10px; }
.h-ic{
  width: 30px; height: 30px;
  border-radius: 12px;
  display:grid; place-items:center;
  border: 1px solid rgba(255,255,255,.10);
  background: rgba(255,255,255,.04);
}
.h-lab{ font-weight: 900; color: rgba(255,255,255,.86); font-size: 13px; }
.h-amt{ font-weight: 1000; color: rgba(234,243,255,.92); }

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
  border-left: 2px solid rgba(90,180,255,.35);
  border-right: 2px solid rgba(90,180,255,.35);
  box-shadow: 0 0 24px rgba(90,180,255,.18);
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
.face.back{ transform: rotateY(180deg); }
.ic{ font-size: 34px; filter: drop-shadow(0 10px 18px rgba(0,0,0,.35)); }
.amt{ font-weight: 1100; font-size: 18px; color: rgba(234,243,255,.95); }
.lab{ font-weight: 900; font-size: 11px; color: rgba(255,255,255,.70); margin-top: -2px; }

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
.loot-row.rare{ border-color: rgba(90,180,255,.28); box-shadow: 0 0 0 1px rgba(90,180,255,.10); }
.loot-row.epic{ border-color: rgba(255,115,220,.30); box-shadow: 0 0 0 1px rgba(255,115,220,.10); }
.loot-row.legendary{ border-color: rgba(255,208,90,.32); box-shadow: 0 0 0 1px rgba(255,208,90,.12); }

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

</style>
