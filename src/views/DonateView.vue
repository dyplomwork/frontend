<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import GamePageLayout from '../components/GamePageLayout.vue'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import { api } from '../utils/api'
import { formatNumber } from '../utils/format'
import { reportError } from '../utils/errors'

// Google Pay injects a global; type it loosely.
declare global {
  interface Window { google?: any }
}

type Package = { id: string; priceUsd: number; coins: number; bonusPct: number }
type Donation = { id: string; packageId: string; amountUsd: number; coinsCredited: number; status: string; createdAt: string }

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()
const ui = useUiStore()

const packages = ref<Package[]>([])
const history = ref<Donation[]>([])
const selectedId = ref<string | null>(null)
const loading = ref(true)
const processing = ref(false)
const gpayReady = ref(false)
const gpayError = ref(false)

const fmt = (v: number) => formatNumber(v, 0)

// ── Google Pay (TEST environment) ──────────────────────────────────────────
// PAYMENT_GATEWAY + the 'example' gateway is Google's documented sandbox setup:
// it returns a test token without needing a real merchant/payment processor.
const baseRequest = { apiVersion: 2, apiVersionMinor: 0 }
const tokenizationSpecification = {
  type: 'PAYMENT_GATEWAY',
  parameters: { gateway: 'example', gatewayMerchantId: 'exampleGatewayMerchantId' },
}
const cardPaymentMethod = {
  type: 'CARD',
  parameters: {
    allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
    allowedCardNetworks: ['MASTERCARD', 'VISA'],
  },
  tokenizationSpecification,
}
let paymentsClient: any = null

function loadGooglePayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.payments?.api) return resolve()
    const existing = document.querySelector('script[data-gpay]') as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('gpay script error')))
      return
    }
    const s = document.createElement('script')
    s.src = 'https://pay.google.com/gp/p/js/pay.js'
    s.async = true
    s.dataset.gpay = '1'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('gpay script error'))
    document.head.appendChild(s)
  })
}

async function initGooglePay() {
  try {
    await loadGooglePayScript()
    paymentsClient = new window.google.payments.api.PaymentsClient({ environment: 'TEST' })
    const res = await paymentsClient.isReadyToPay({
      ...baseRequest,
      allowedPaymentMethods: [cardPaymentMethod],
    })
    gpayReady.value = !!res.result
    if (!gpayReady.value) gpayError.value = true
  } catch (e) {
    gpayError.value = true
    reportError(e)
  }
}

function uuid(): string {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

async function pay(pkg: Package) {
  if (!auth.isAuthed) {
    router.push({ name: 'login', query: { next: '/donate' } })
    return
  }
  if (!paymentsClient || !gpayReady.value || processing.value) return

  selectedId.value = pkg.id
  processing.value = true
  try {
    const paymentDataRequest = {
      ...baseRequest,
      allowedPaymentMethods: [cardPaymentMethod],
      merchantInfo: { merchantName: 'SCXDROP' },
      transactionInfo: {
        totalPriceStatus: 'FINAL',
        totalPrice: pkg.priceUsd.toFixed(2),
        currencyCode: 'USD',
        countryCode: 'US',
      },
    }

    const paymentData = await paymentsClient.loadPaymentData(paymentDataRequest)
    const token = paymentData?.paymentMethodData?.tokenizationData?.token ?? ''

    const res = await api<{ ok: boolean; balance: number; coinsCredited: number; duplicate?: boolean }>(
      '/api/v1/donations/checkout',
      { method: 'POST', json: true, body: { packageId: pkg.id, paymentToken: token, idempotencyKey: uuid() } },
    )

    auth.setBalance(res.balance)
    ui.toast(t('ui.s_donate_success', { coins: fmt(res.coinsCredited || pkg.coins) }), 'success')
    void loadHistory()
  } catch (e: any) {
    // Google Pay throws { statusCode: 'CANCELED' } when the user closes the sheet.
    if (e?.statusCode === 'CANCELED') {
      ui.toast(t('ui.s_donate_cancelled'), 'info')
    } else {
      ui.toast(t('ui.s_donate_failed'), 'error')
      reportError(e)
    }
  } finally {
    processing.value = false
  }
}

async function loadPackages() {
  try {
    const res = await api<{ ok: boolean; packages: Package[] }>('/api/v1/donations/packages', { noAuth: true })
    packages.value = res.packages ?? []
  } catch (e) {
    reportError(e)
  }
}

async function loadHistory() {
  if (!auth.isAuthed) return
  try {
    const res = await api<{ ok: boolean; donations: Donation[] }>('/api/v1/donations/me')
    history.value = res.donations ?? []
  } catch (e) {
    reportError(e)
  }
}

function dateStr(s: string) {
  try { return new Date(s).toLocaleDateString() } catch { return s }
}

onMounted(async () => {
  loading.value = true
  await Promise.all([loadPackages(), loadHistory()])
  loading.value = false
  await initGooglePay()
})
</script>

<template>
  <GamePageLayout :min-height="560">
    <div class="donate-wrap">
      <div class="donate-head card">
        <h2 style="margin:0">💎 {{ $t('ui.s_donate_title') }}</h2>
        <div class="muted">{{ $t('ui.s_donate_subtitle') }}</div>
      </div>

      <div v-if="!auth.isAuthed" class="card notice-login">
        <span>{{ $t('ui.s_donate_login') }}</span>
        <button class="btn btn-primary" @click="router.push({ name: 'login', query: { next: '/donate' } })">
          {{ $t('ui.s_99dea78007') }}
        </button>
      </div>

      <div v-if="loading" class="muted pad">{{ $t('ui.s_43e40d49fd') }}</div>

      <div v-else class="pkg-grid">
        <div
          v-for="p in packages"
          :key="p.id"
          class="pkg-card"
          :class="{ 'pkg-busy': processing && selectedId === p.id }"
        >
          <div v-if="p.bonusPct > 0" class="pkg-bonus">+{{ p.bonusPct }}% {{ $t('ui.s_donate_bonus') }}</div>
          <div class="pkg-coins">{{ fmt(p.coins) }} <span class="pkg-k">K</span></div>
          <div class="pkg-get muted small">{{ $t('ui.s_donate_get') }}</div>
          <div class="pkg-price">${{ p.priceUsd.toFixed(2) }}</div>

          <button
            class="gpay-btn"
            :disabled="processing || (!gpayReady && auth.isAuthed)"
            @click="pay(p)"
          >
            <span v-if="processing && selectedId === p.id">{{ $t('ui.s_donate_processing') }}</span>
            <span v-else class="gpay-label">
              <svg class="gpay-ic" viewBox="0 0 41 17" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path fill="currentColor" d="M19.5 8.4v4.9h-1.6V1.3h4.1c1 0 1.9.4 2.6 1.1.7.6 1 1.5 1 2.4 0 1-.3 1.8-1 2.4-.7.7-1.5 1-2.6 1l-2.5.2zm0-5.6v4.1h2.6c.6 0 1.1-.2 1.5-.6.8-.8.8-2 0-2.8-.4-.4-.9-.7-1.5-.7h-2.6zm10.3 2c1.2 0 2.1.3 2.8 1 .7.6 1 1.5 1 2.6v5.1h-1.5v-1.2h-.1c-.7 1-1.5 1.4-2.6 1.4-.9 0-1.7-.3-2.3-.8-.6-.5-.9-1.2-.9-2 0-.9.3-1.5.9-2 .6-.5 1.5-.8 2.5-.8.9 0 1.6.2 2.2.5v-.4c0-.6-.2-1-.7-1.4-.4-.4-1-.6-1.6-.6-.9 0-1.6.4-2.1 1.1l-1.4-.9c.8-1.2 1.9-1.7 3.4-1.7l-.0.3zm-2.1 6.2c0 .4.2.8.5 1 .3.3.7.4 1.2.4.6 0 1.2-.2 1.7-.7.5-.5.8-1 .8-1.6-.5-.4-1.2-.6-2-.6-.6 0-1.2.2-1.6.5-.4.2-.6.6-.6 1zM41 5l-5.1 11.8h-1.6l1.9-4.1L32.8 5h1.7l2.4 5.9h.0L39.3 5H41z"/>
              </svg>
              <span>{{ $t('ui.s_donate_pay') }}</span>
            </span>
          </button>
        </div>
      </div>

      <div v-if="gpayError && auth.isAuthed" class="muted small gpay-warn">
        ⚠ {{ $t('ui.s_donate_unavailable') }}
      </div>

      <div class="muted small donate-note">{{ $t('ui.s_donate_note') }}</div>

      <div class="card hist-card">
        <h3 style="margin:0 0 10px">{{ $t('ui.s_donate_history') }}</h3>
        <div v-if="!history.length" class="muted small">{{ $t('ui.s_donate_history_empty') }}</div>
        <div v-else class="hist-list">
          <div v-for="d in history" :key="d.id" class="hist-row">
            <span class="hist-coins">+{{ fmt(d.coinsCredited) }} K</span>
            <span class="muted small">${{ d.amountUsd.toFixed(2) }}</span>
            <span class="muted small">{{ dateStr(d.createdAt) }}</span>
          </div>
        </div>
      </div>
    </div>
  </GamePageLayout>
</template>

<style scoped>
.donate-wrap { width: min(1000px, 100%); margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }
.donate-head { border-radius: 18px; padding: 16px; border: 1px solid rgba(255,178,74,.15); display: flex; flex-direction: column; gap: 6px; }
.pad { padding: 20px; }
.small { font-size: 12px; }

.notice-login { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border-radius: 14px; }

.pkg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
.pkg-card {
  position: relative;
  background: rgba(0,0,0,.25);
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 16px;
  padding: 18px 14px 14px;
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  transition: border-color 120ms, transform 100ms;
}
.pkg-card:hover { transform: translateY(-2px); border-color: rgba(255,210,80,.5); }
.pkg-busy { opacity: .7; }
.pkg-bonus {
  position: absolute; top: -10px; right: 10px;
  background: linear-gradient(90deg,#f59e0b,#ec4899); color: #fff;
  font-size: 11px; font-weight: 900; padding: 3px 8px; border-radius: 999px;
}
.pkg-coins { font-size: 24px; font-weight: 1000; color: #ffd54a; }
.pkg-k { font-size: 15px; opacity: .85; }
.pkg-get { margin-top: -4px; }
.pkg-price { font-size: 18px; font-weight: 900; margin: 4px 0 10px; }

.gpay-btn {
  width: 100%; height: 42px; border-radius: 10px; cursor: pointer;
  background: #000; color: #fff; border: 1px solid rgba(255,255,255,.25);
  font-weight: 700; display: flex; align-items: center; justify-content: center;
  transition: background 120ms, opacity 120ms;
}
.gpay-btn:hover:not(:disabled) { background: #1f1f1f; }
.gpay-btn:disabled { opacity: .5; cursor: not-allowed; }
.gpay-label { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; }
.gpay-ic { height: 16px; width: auto; }

.gpay-warn { padding: 0 4px; }
.donate-note { padding: 0 4px; opacity: .7; }

.hist-card { border-radius: 16px; padding: 14px 16px; border: 1px solid rgba(255,255,255,.08); }
.hist-list { display: flex; flex-direction: column; gap: 6px; }
.hist-row { display: flex; align-items: center; gap: 14px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,.05); }
.hist-coins { font-weight: 900; color: #34d399; min-width: 120px; }
</style>
