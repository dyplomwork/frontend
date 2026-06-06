<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter, RouterView, RouterLink } from 'vue-router'
import { useAuthStore } from './stores/auth'
import { useUiStore } from './stores/ui'
import { isSfxOn, setSfxOn, sfx } from './utils/sfx'
import { getBgmVolume, initBgm, isBgmOn, setBgmVolume } from './utils/bgm'
import { formatNumber } from './utils/format'
import { useI18n } from 'vue-i18n'
import AppFooter from './components/AppFooter.vue'
import SeoHead from './components/SeoHead.vue'
import BigWinOverlay from './components/BigWinOverlay.vue'
import ToastHost from './components/ToastHost.vue'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const ui = useUiStore()

const { locale } = useI18n()
const LS_LOCALE = 'app_locale_v1'
const toggleLang = () => {
  locale.value = locale.value === 'ua' ? 'en' : 'ua'
  localStorage.setItem('app_locale_v1', locale.value)
}

const LS_SIDEBAR = 'sopov_sidebar_open_v1'
const sidebarOpen = ref(false)

const bgmOn = ref(true)
const bgmVol = ref(0.15)

const fmt = (v: number | string, d = 2) => formatNumber(v, d)

onMounted(() => {
  const savedLocale = localStorage.getItem(LS_LOCALE)
  if (savedLocale === 'ua' || savedLocale === 'en') locale.value = savedLocale

  sidebarOpen.value = localStorage.getItem(LS_SIDEBAR) === '1'

  bgmOn.value = isBgmOn()
  bgmVol.value = getBgmVolume()
  initBgm()

  if (!bgmOn.value) {
    bgmVol.value = 0
    setBgmVolume(0)
  } else {
    setBgmVolume(bgmVol.value)
  }
})

function toggleMusicIcon() {
  if (bgmVol.value > 0 && bgmOn.value) {
    bgmVol.value = 0
    bgmOn.value = false
    setBgmVolume(0)
    return
  }

  bgmVol.value = 0.2
  bgmOn.value = true
  setBgmVolume(0.2)
}

function onBgmVolInput(e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  bgmVol.value = v
  bgmOn.value = v > 0
  setBgmVolume(v)
}

function toggleSidebar() {
  sfx('click')
  sidebarOpen.value = !sidebarOpen.value
  localStorage.setItem(LS_SIDEBAR, sidebarOpen.value ? '1' : '0')
}

const sfxOn = ref(isSfxOn())
watch(sfxOn, (v) => setSfxOn(!!v), { immediate: true })
function toggleSfx() { sfxOn.value = !sfxOn.value }

// Drops strip — queue-based, each new drop slides through exactly once;
// when idle, cycles top-5 rarest recent drops
import { api } from './utils/api'
type Drop = { nick: string; icon: string; name: string; nameUa: string; rarity: string; color: string; ts: number }

const RARITY_ORDER: Record<string, number> = { mythic: 5, legendary: 4, epic: 3, rare: 2, uncommon: 1, common: 0 }

const seenDropTs = new Set<number>()
const dropQueue: Drop[] = []
const activeDrop = ref<Drop | null>(null)
const isIdle = ref(false)
const idleDrops = ref<Drop[]>([])
let idleIdx = 0
let dropKey = 0
let tickerTimer: number | null = null
let tickerInit = false

function dropName(d: Drop) {
  return locale.value === 'ua' ? (d.nameUa || d.name) : d.name
}

function showNextDrop() {
  dropKey++
  if (dropQueue.length > 0) {
    isIdle.value = false
    idleIdx = 0
    activeDrop.value = dropQueue.shift()!
    return
  }
  if (idleDrops.value.length > 0) {
    isIdle.value = true
    activeDrop.value = idleDrops.value[idleIdx % idleDrops.value.length]
    idleIdx++
    return
  }
  isIdle.value = false
  activeDrop.value = null
}

function onDropAnimEnd() {
  // Immediately show next — no gap between items
  showNextDrop()
}

function mergeIdleDrops(newDrops: Drop[]) {
  const merged = [...idleDrops.value, ...newDrops]
  const seen = new Set<number>()
  idleDrops.value = merged
    .filter(d => { if (seen.has(d.ts)) return false; seen.add(d.ts); return true })
    .sort((a, b) => (RARITY_ORDER[b.rarity] ?? 0) - (RARITY_ORDER[a.rarity] ?? 0))
    .slice(0, 5)
}

async function fetchDrops() {
  try {
    const res = await api<Drop[]>('/api/v1/drops/recent', { noAuth: true })
    if (!Array.isArray(res)) return
    if (!tickerInit) {
      for (const d of res) seenDropTs.add(d.ts)
      mergeIdleDrops(res)
      tickerInit = true
      if (!activeDrop.value) setTimeout(showNextDrop, 800)
      return
    }
    const newDrops = res.filter(d => !seenDropTs.has(d.ts)).sort((a, b) => a.ts - b.ts)
    for (const d of newDrops) {
      seenDropTs.add(d.ts)
      dropQueue.push(d)
    }
    if (newDrops.length) mergeIdleDrops(newDrops)
    if (!activeDrop.value && dropQueue.length > 0) showNextDrop()
  } catch {}
}

onMounted(() => {
  void fetchDrops()
  tickerTimer = window.setInterval(fetchDrops, 3000)
})
onUnmounted(() => { if (tickerTimer) clearInterval(tickerTimer) })

function goLogin() {
  sfx('click')
  router.push('/login')
}
function goRegister() {
  sfx('click')
  router.push('/register')
}
function logout() {
  sfx('click')
  auth.logout()
  router.push('/')
}
</script>

<template>
  <SeoHead />
  <div class="app-shell" :class="{ open: sidebarOpen }">
    <!-- Left Sidebar -->
    <aside class="app-sidebar" :class="{ open: sidebarOpen }">
      <div class="side-top">
        <button class="icon-btn" @click="toggleSidebar" :title="$t('ui.s_menu')">
          <img class="topbar-menu-ic" src="/icon/menu.png" alt="Menu" />
        </button>
      </div>

      <nav class="side-nav">
        <RouterLink
          to="/"
          class="side-link"
          :class="{ active: route.path === '/' }"
          :title="$t('ui.s_8cf04a9734')"
        >
          <span class="side-ic"><img class="nav-ic" src="/icon/home.png" alt="Home" /></span>
          <span class="side-txt" v-if="sidebarOpen">{{ $t('ui.s_8cf04a9734') }}</span>
        </RouterLink>
        <RouterLink
          to="/clicker"
          class="side-link"
          :class="{ active: route.path.startsWith('/clicker') }"
          :title="$t('ui.s_clicker')"
        >
          <span class="side-ic side-emoji">🪙</span>
          <span class="side-txt" v-if="sidebarOpen">{{ $t('ui.s_clicker') }}</span>
        </RouterLink>
        <RouterLink
          to="/roulette"
          class="side-link"
          :class="{ active: route.path.startsWith('/roulette') }"
          :title="$t('ui.s_3cf6443ea2')"
        >
          <span class="side-ic"><img class="nav-ic" src="/icon/roulette.png" alt="Roulette" /></span>
          <span class="side-txt" v-if="sidebarOpen">{{ $t('ui.s_3cf6443ea2') }}</span>
        </RouterLink>
        <RouterLink
          to="/dice"
          class="side-link"
          :class="{ active: route.path.startsWith('/dice') }"
          :title="$t('ui.s_a5b6cdb9de')"
        >
          <span class="side-ic"><img class="nav-ic" src="/icon/dice.png" alt="Dice" /></span>
          <span class="side-txt" v-if="sidebarOpen">{{ $t('ui.s_a5b6cdb9de') }}</span>
        </RouterLink>
        <RouterLink
          to="/coinflip"
          class="side-link"
          :class="{ active: route.path.startsWith('/coinflip') }"
          :title="$t('ui.s_24397a9d6f')"
        >
          <span class="side-ic">
            <img class="nav-ic" src="/icon/coinflip.png" alt="Coin Flip" />
          </span>
          <span class="side-txt" v-if="sidebarOpen">{{ $t('ui.s_24397a9d6f') }}</span>
        </RouterLink>
        <RouterLink
          to="/plinko"
          class="side-link"
          :class="{ active: route.path.startsWith('/plinko') }"
          :title="$t('ui.s_6643fdd61a')"
        >
          <span class="side-ic"><img class="nav-ic" src="/icon/plinko.png" alt="Plinko" /></span>
          <span class="side-txt" v-if="sidebarOpen">{{ $t('ui.s_6643fdd61a') }}</span>
        </RouterLink>
        <RouterLink
          to="/mines"
          class="side-link"
          :class="{ active: route.path.startsWith('/mines') }"
          :title="$t('ui.s_c3fc302af4')"
        >
          <span class="side-ic"><img class="nav-ic" src="/icon/mines.png" alt="Mines" /></span>
          <span class="side-txt" v-if="sidebarOpen">{{ $t('ui.s_c3fc302af4') }}</span>
        </RouterLink>
        <RouterLink
          to="/cases"
          class="side-link"
          :class="{ active: route.path.startsWith('/cases') }"
          :title="$t('ui.s_b1f0b866ff')"
        >
          <span class="side-ic"><img class="nav-ic" src="/icon/cases.png" alt="Cases" /></span>
          <span class="side-txt" v-if="sidebarOpen">{{ $t('ui.s_b1f0b866ff') }}</span>
        </RouterLink>
        <RouterLink
          to="/inventory"
          class="side-link"
          :class="{ active: route.path.startsWith('/inventory') }"
          :title="$t('ui.s_inventory')"
        >
          <span class="side-ic side-emoji">🎒</span>
          <span class="side-txt" v-if="sidebarOpen">{{ $t('ui.s_inventory') }}</span>
        </RouterLink>
        <RouterLink
          to="/auction"
          class="side-link"
          :class="{ active: route.path.startsWith('/auction') }"
          :title="$t('ui.s_auction')"
        >
          <span class="side-ic side-emoji">🏷️</span>
          <span class="side-txt" v-if="sidebarOpen">{{ $t('ui.s_auction') }}</span>
        </RouterLink>
        <RouterLink
          to="/profile"
          class="side-link"
          :class="{ active: route.path.startsWith('/profile') }"
          :title="$t('ui.s_cce99c598c')"
        >
          <span class="side-ic"><img class="nav-ic" src="/icon/profile.png" alt="Profile" /></span>
          <span class="side-txt" v-if="sidebarOpen">{{ $t('ui.s_cce99c598c') }}</span>
        </RouterLink>
      </nav>

      <div class="side-bottom">
        <div class="audio-row" :class="{ off: !bgmOn }">
          <button
            class="icon-btn audio-btn"
            @click.stop="toggleMusicIcon"
            :title="bgmOn ? $t('ui.s_b0389cd7a0') : $t('ui.s_6d100a9054')"
          >
            <span class="ic">{{ bgmOn ? '🎵' : '🔕' }}</span>
          </button>
          <input
            v-if="sidebarOpen"
            class="audio-slider"
            type="range"
            min="0"
            max="1"
            step="0.01"
            :value="bgmVol"
            @input="onBgmVolInput"
            :aria-label="$t('ui.s_6215fda1c3')"
          />
        </div>

        <button
          class="icon-btn audio-btn"
          @click="toggleSfx"
          :class="{ off: !sfxOn }"
          :title="sfxOn ? $t('ui.s_45d958c08c') : $t('ui.s_bb70d8d3f5')"
        >
          <span class="ic">{{ sfxOn ? '🔊' : '🔇' }}</span>
        </button>

        <div class="lang-row" >
          <button class="icon-btn audio-btn" @click="toggleLang" :title="$t('ui.s_lang')">
            <span class="ic">{{ locale.toUpperCase() }}</span>
          </button>
        </div>
      </div>
    </aside>

    <div class="app-main">
      <header class="app-topbar">
        <div class="top-left">
          <button class="icon-btn topbar-menu" @click="toggleSidebar" aria-label="Menu">
            <img class="topbar-menu-ic" src="/icon/menu.png" alt="Menu" />
          </button>
          <div class="logo" @click="router.push('/')">
            <span class="logo-mark">SCXDROP</span>
          </div>
        </div>

        <div class="top-right">
          <template v-if="auth.user">
            <div class="user-pill" :title="auth.user.nickname">
              <span class="nick">{{ auth.user.nickname }}</span>
            </div>
            <div class="balance-pill">
              <span class="muted">{{ $t('ui.s_99a808d8d1') }}</span>
              <span class="bal">{{ fmt(ui.balanceOverride ?? auth.user.balance, 2) }}</span>
              <span class="coin" :aria-label="$t('ui.s_d940a38dce')">K</span>
            </div>
            <!-- Admin button — only visible to admins -->
            <button
              v-if="auth.isAdmin"
              class="btn btn-admin"
              @click="router.push('/admin')"
              title="Admin Panel"
            >
              ⚙️ Admin
            </button>
            <button class="btn" @click="logout">{{ $t('ui.s_logout') }}</button>
          </template>
          <template v-else>
            <button class="btn" @click="goLogin">{{ $t('ui.s_99dea78007') }}</button>
            <button class="btn btn-blue" @click="goRegister">{{ $t('ui.s_0b93f81293') }}</button>
          </template>
        </div>
      </header>

      <!-- Drops strip: always visible; new drops priority, idle cycles top-5 rarest -->
      <div class="drops-strip" :class="{ 'strip-idle': isIdle }">
        <div class="strip-live">
          <span v-if="!isIdle" class="strip-dot-pulse"></span>
          <span v-else class="strip-dot-idle">★</span>
          {{ isIdle ? 'ТОП' : 'LIVE' }}
        </div>
        <div class="strip-scroll">
          <div v-if="activeDrop" class="strip-item" @animationend="onDropAnimEnd" :key="dropKey">
            <span class="strip-rarity-dot" :style="{ color: activeDrop.color }">⬤</span>
            <span class="strip-nick">{{ activeDrop.nick }}</span>
            <span class="strip-sep">{{ isIdle ? 'нещодавно виграв' : 'виграв' }}</span>
            <span class="strip-icon">{{ activeDrop.icon }}</span>
            <span class="strip-name" :style="{ color: activeDrop.color }">{{ dropName(activeDrop) }}</span>
            <span class="strip-tag" :style="{ color: activeDrop.color }">{{ activeDrop.rarity }}</span>
          </div>
        </div>
      </div>

      <main class="app-content">
        <RouterView />
      </main>

      <AppFooter class="app-footer" />

      <BigWinOverlay />
      <ToastHost />
    </div>
  </div>
</template>
