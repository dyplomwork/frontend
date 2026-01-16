<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, RouterView, RouterLink } from 'vue-router'
import { useAuthStore } from './stores/auth'
import { isSfxOn, setSfxOn, sfx } from './utils/sfx'
import { getBgmVolume, initBgm, isBgmOn, setBgmVolume } from './utils/bgm'
import { formatNumber } from './utils/format'
import { useI18n } from 'vue-i18n'
import AppFooter from './components/AppFooter.vue'
import SeoHead from './components/SeoHead.vue'
import BigWinOverlay from './components/BigWinOverlay.vue'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const { locale } = useI18n()
const LS_LOCALE = 'app_locale_v1'
const toggleLang = () => {
  locale.value = locale.value === 'ru' ? 'en' : 'ru'
  localStorage.setItem('app_locale_v1', locale.value)
}

const LS_SIDEBAR = 'sopov_sidebar_open_v1'
const sidebarOpen = ref(false)

const bgmOn = ref(true)
const bgmVol = ref(0.15)

const fmt = (v: number | string, d = 2) => formatNumber(v, d)

onMounted(() => {
  const savedLocale = localStorage.getItem(LS_LOCALE)
  if (savedLocale === 'ru' || savedLocale === 'en') locale.value = savedLocale

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
function toggleSfx() {
  sfxOn.value = !sfxOn.value
}

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
  <div class="casino-app" :class="{ open: sidebarOpen }">
    <!-- Left Sidebar -->
    <aside class="casino-sidebar" :class="{ open: sidebarOpen }">
      <div class="side-top">
        <button class="icon-btn" @click="toggleSidebar" title="Menu">
          <span class="ic">≡</span>
        </button>
      </div>

      <nav class="side-nav">
        <RouterLink
          to="/"
          class="side-link"
          :class="{ active: route.path === '/' }"
          :title="$t('ui.s_8cf04a9734')"
        >
          <span class="side-ic">🏠</span>
          <span class="side-txt" v-if="sidebarOpen">{{ $t('ui.s_8cf04a9734') }}</span>
        </RouterLink>
        <RouterLink
          to="/roulette"
          class="side-link"
          :class="{ active: route.path.startsWith('/roulette') }"
          :title="$t('ui.s_3cf6443ea2')"
        >
          <span class="side-ic">🎡</span>
          <span class="side-txt" v-if="sidebarOpen">{{ $t('ui.s_3cf6443ea2') }}</span>
        </RouterLink>
        <RouterLink
          to="/dice"
          class="side-link"
          :class="{ active: route.path.startsWith('/dice') }"
          :title="$t('ui.s_a5b6cdb9de')"
        >
          <span class="side-ic">🎲</span>
          <span class="side-txt" v-if="sidebarOpen">{{ $t('ui.s_a5b6cdb9de') }}</span>
        </RouterLink>
        <RouterLink
          to="/coinflip"
          class="side-link"
          :class="{ active: route.path.startsWith('/coinflip') }"
          :title="$t('ui.s_24397a9d6f')"
        >
          <span class="side-ic">
            <img src="/icon/coinflip.svg" alt="Coin Flip" />
          </span>
          <span class="side-txt" v-if="sidebarOpen">{{ $t('ui.s_24397a9d6f') }}</span>
        </RouterLink>
        <RouterLink
          to="/plinko"
          class="side-link"
          :class="{ active: route.path.startsWith('/plinko') }"
          :title="$t('ui.s_6643fdd61a')"
        >
          <span class="side-ic">🔻</span>
          <span class="side-txt" v-if="sidebarOpen">{{ $t('ui.s_6643fdd61a') }}</span>
        </RouterLink>
        <RouterLink
          to="/mines"
          class="side-link"
          :class="{ active: route.path.startsWith('/mines') }"
          :title="$t('ui.s_c3fc302af4')"
        >
          <span class="side-ic">💣</span>
          <span class="side-txt" v-if="sidebarOpen">{{ $t('ui.s_c3fc302af4') }}</span>
        </RouterLink>
        <RouterLink
          to="/cases"
          class="side-link"
          :class="{ active: route.path.startsWith('/cases') }"
          :title="$t('ui.s_b1f0b866ff')"
        >
          <span class="side-ic">🎁</span>
          <span class="side-txt" v-if="sidebarOpen">{{ $t('ui.s_b1f0b866ff') }}</span>
        </RouterLink>
        <RouterLink
          to="/profile"
          class="side-link"
          :class="{ active: route.path.startsWith('/profile') }"
          :title="$t('ui.s_cce99c598c')"
        >
          <span class="side-ic">👤</span>
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
          <button class="icon-btn audio-btn" @click="toggleLang" title="Switch language">
            <span class="ic">{{ locale === 'ru' ? '🇷🇺' : '🇺🇸' }}</span>
          </button>
        </div>
      </div>
    </aside>

    <div class="casino-main">
      <header class="casino-topbar">
        <div class="top-left">
          <button class="icon-btn topbar-menu" @click="toggleSidebar" aria-label="Menu">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path fill="currentColor" d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z" />
            </svg>
          </button>
          <div class="logo" @click="router.push('/')">
            <span class="logo-mark">SCXDROP</span>
          </div>
        </div>

        <div class="top-right">
          <template v-if="auth.user">
            <div class="balance-pill">
              <span class="muted">{{ $t('ui.s_99a808d8d1') }}</span>
              <span class="bal">{{ fmt(auth.user.balance, 2) }}</span>
              <span class="coin" :aria-label="$t('ui.s_d940a38dce')">K</span>
            </div>
            <button class="btn" @click="logout">Logout</button>
          </template>
          <template v-else>
            <button class="btn" @click="goLogin">Login</button>
            <button class="btn btn-blue" @click="goRegister">Register</button>
          </template>
        </div>
      </header>

      <main class="casino-content">
        <RouterView />
      </main>

      <AppFooter class="casino-footer" />

      <BigWinOverlay />
    </div>
  </div>
</template>
