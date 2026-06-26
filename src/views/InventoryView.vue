<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import GamePageLayout from '../components/GamePageLayout.vue'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import { api } from '../utils/api'
import { formatNumber } from '../utils/format'

const { t, locale } = useI18n()
const auth = useAuthStore()
const ui = useUiStore()

type InventoryItem = {
  id: string; itemDefId: string; name: string; nameUa: string;
  rarity: string; icon: string; color: string; value: number;
  source: string; createdAt: string; listingId: string | null;
}

const items = ref<InventoryItem[]>([])
const loading = ref(false)
const filterRarity = ref('')
const sellItemId = ref<string | null>(null)
const sellPrice = ref(0)
const sellBusy = ref(false)
const msg = ref('')
const msgType = ref<'success'|'error'>('success')

const vendorItem = ref<InventoryItem | null>(null)
const vendorBusy = ref(false)

function vendorPrice(item: InventoryItem) { return Math.floor(item.value * 0.5) }

function startVendorSell(item: InventoryItem) {
  if (item.listingId) return
  vendorItem.value = item
  msg.value = ''
}

async function confirmVendorSell() {
  if (!vendorItem.value) return
  vendorBusy.value = true
  msg.value = ''
  try {
    const res = await api<any>(`/api/v1/items/${vendorItem.value.id}/sell-vendor`, { method: 'POST' })
    msg.value = t('ui.s_inv_vendor_sold', { amount: formatNumber(res.gained, 2) })
    msgType.value = 'success'
    if (auth.user) auth.user = { ...auth.user, balance: res.balance }
    vendorItem.value = null
    await load()
  } catch (e: any) {
    msg.value = e?.message ?? t('ui.s_error')
    msgType.value = 'error'
  } finally {
    vendorBusy.value = false
  }
}

const RARITIES = ['common','uncommon','rare','epic','legendary','mythic']
const RARITY_KEY: Record<string, string> = {
  common: 's_rarity_common', uncommon: 's_rarity_uncommon',
  rare: 's_rarity_rare', epic: 's_rarity_epic',
  legendary: 's_rarity_legendary', mythic: 's_rarity_mythic',
}

const fmt = (v: number) => formatNumber(v, 2)

function rarityColor(r: string): string {
  const map: Record<string,string> = { common:'#9ca3af', uncommon:'#34d399', rare:'#3b82f6', epic:'#a855f7', legendary:'#f59e0b', mythic:'#ec4899' }
  return map[r] ?? '#9ca3af'
}
function itemName(item: InventoryItem) {
  return locale.value === 'ua' ? item.nameUa : item.name
}
function rarityLabel(r: string) {
  return t(`ui.${RARITY_KEY[r] ?? 's_rarity_common'}`)
}

const filtered = computed(() => {
  if (!filterRarity.value) return items.value
  return items.value.filter(i => i.rarity === filterRarity.value)
})

async function load() {
  if (!auth.user) return
  loading.value = true
  try {
    const res = await api<any>('/api/v1/items/me', { method: 'GET' })
    items.value = res.items ?? []
  } catch (e: any) {
    ui.toast(e?.message ?? t('ui.s_error'), 'error')
  } finally {
    loading.value = false
  }
}

function startSell(item: InventoryItem) {
  sellItemId.value = item.id
  sellPrice.value = Math.ceil(item.value * 1.1)
  msg.value = ''
}

async function submitSell() {
  if (!sellItemId.value || sellPrice.value <= 0) return
  sellBusy.value = true
  msg.value = ''
  try {
    await api('/api/v1/auction', { method: 'POST', json: true, body: { itemId: sellItemId.value, price: sellPrice.value } })
    msg.value = t('ui.s_auction_list_item')
    msgType.value = 'success'
    sellItemId.value = null
    await load()
  } catch (e: any) {
    msg.value = e?.message ?? t('ui.s_error')
    msgType.value = 'error'
  } finally {
    sellBusy.value = false
  }
}

async function delist(listingId: string) {
  try {
    await api(`/api/v1/auction/${listingId}`, { method: 'DELETE' })
    await load()
  } catch (e: any) {
    ui.toast(e?.message ?? t('ui.s_error'), 'error')
  }
}

onMounted(load)
</script>

<template>
  <GamePageLayout :min-height="560">
    <div class="inv-wrap">
      <div class="inv-head card">
        <div class="row-between">
          <div>
            <h2 style="margin:0">{{ $t('ui.s_inventory') }}</h2>
            <div class="muted small">{{ $t('ui.s_inventory_total', { n: items.length }) }}</div>
          </div>
          <button class="btn" @click="load" :disabled="loading">↻</button>
        </div>

        <div class="filter-row" style="margin-top:12px;">
          <button class="filter-chip" :class="{ on: !filterRarity }" @click="filterRarity = ''">
            {{ $t('ui.s_inventory_all') }}
          </button>
          <button
            v-for="r in RARITIES" :key="r"
            class="filter-chip" :class="{ on: filterRarity === r }"
            @click="filterRarity = filterRarity === r ? '' : r"
            :style="{ '--rc': rarityColor(r) }"
          >
            {{ rarityLabel(r) }}
          </button>
        </div>

        <div v-if="msg" class="notice" :class="msgType" style="margin-top:10px;">{{ msg }}</div>
      </div>

      <div v-if="!auth.user" class="muted pad">{{ $t('ui.s_profile_no_auth') }}</div>
      <div v-else-if="loading" class="muted pad">{{ $t('ui.s_43e40d49fd') }}</div>
      <div v-else-if="filtered.length === 0" class="muted pad">{{ $t('ui.s_inventory_empty') }}</div>

      <div v-else class="inv-grid">
        <div
          v-for="item in filtered"
          :key="item.id"
          class="item-card"
          :style="{ '--ic': item.color }"
        >
          <div class="item-icon">{{ item.icon }}</div>
          <div class="item-rarity" :style="{ color: item.color }">{{ rarityLabel(item.rarity) }}</div>
          <div class="item-name">{{ itemName(item) }}</div>
          <div class="item-value muted small">{{ $t('ui.s_inventory_value') }}: {{ fmt(item.value) }} K</div>

          <div v-if="item.listingId" class="item-listed muted small">
            {{ $t('ui.s_inventory_listed') }}
            <button class="btn btn-sm" @click="delist(item.listingId!)">{{ $t('ui.s_auction_delist') }}</button>
          </div>
          <div v-else class="item-actions">
            <button class="btn item-sell-btn" @click="startSell(item)" :title="$t('ui.s_inventory_sell')">
              🏷️ {{ $t('ui.s_auction') }}
            </button>
            <button class="btn item-vendor-btn" @click="startVendorSell(item)" :title="$t('ui.s_inv_vendor_title50')">
              🛒 {{ vendorPrice(item) > 0 ? formatNumber(vendorPrice(item), 0) + ' K' : $t('ui.s_inv_sell') }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="vendorItem" class="modal-backdrop" @click.self="vendorItem = null">
        <div class="modal-box card">
          <h3 style="margin:0 0 6px">🛒 {{ $t('ui.s_inv_vendor_heading') }}</h3>
          <p class="muted small" style="margin:0 0 14px">{{ $t('ui.s_inv_vendor_desc') }}</p>
          <div class="vendor-item-preview">
            <span style="font-size:32px">{{ vendorItem.icon }}</span>
            <div>
              <div class="item-name" :style="{ color: vendorItem.color }">{{ itemName(vendorItem) }}</div>
              <div class="muted small">{{ $t('ui.s_inv_base_price') }}: {{ fmt(vendorItem.value) }} K</div>
              <div style="font-weight:900; font-size:16px; color:#4ade80">{{ $t('ui.s_inv_you_get') }}: {{ fmt(vendorPrice(vendorItem)) }} K</div>
            </div>
          </div>
          <div class="row" style="gap:10px; margin-top:16px;">
            <button class="btn btn-primary" @click="confirmVendorSell" :disabled="vendorBusy">
              {{ vendorBusy ? $t('ui.s_inv_selling') : $t('ui.s_inv_sell') }}
            </button>
            <button class="btn" @click="vendorItem = null">{{ $t('ui.s_cf_cancel') }}</button>
          </div>
        </div>
      </div>

      <div v-if="sellItemId" class="modal-backdrop" @click.self="sellItemId = null">
        <div class="modal-box card">
          <h3 style="margin:0 0 12px">{{ $t('ui.s_auction_list_item') }}</h3>
          <div class="field">
            <label class="label">{{ $t('ui.s_inventory_sell_price') }} (K)</label>
            <input class="input" type="number" v-model.number="sellPrice" min="1" />
          </div>
          <div class="muted small" style="margin-top:6px;">{{ $t('ui.s_auction_fee') }}</div>
          <div class="row" style="gap:10px; margin-top:14px;">
            <button class="btn btn-primary" @click="submitSell" :disabled="sellBusy || sellPrice <= 0">
              {{ $t('ui.s_auction_list_item') }}
            </button>
            <button class="btn" @click="sellItemId = null">{{ $t('ui.s_cf_cancel') }}</button>
          </div>
        </div>
      </div>
    </div>
  </GamePageLayout>
</template>

<style scoped>
.inv-wrap { width: min(1200px, 100%); margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }
.inv-head { border-radius: 18px; padding: 14px; border: 1px solid rgba(255,255,255,.08); }
.row-between { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.small { font-size: 12px; }
.pad { padding: 20px; }
.filter-row { display: flex; gap: 8px; flex-wrap: wrap; }
.filter-chip { padding: 6px 14px; border-radius: 999px; border: 1px solid rgba(255,255,255,.10); background: rgba(0,0,0,.18); color: rgba(255,255,255,.8); cursor: pointer; font-size: 12px; font-weight: 700; }
.filter-chip.on { background: rgba(255,255,255,.12); border-color: rgba(255,255,255,.3); }
.notice { padding: 10px 12px; border-radius: 12px; font-size: 13px; border: 1px solid rgba(255,255,255,.08); }
.notice.success { border-color: rgba(34,197,94,.35); background: rgba(34,197,94,.10); }
.notice.error { border-color: rgba(248,81,73,.35); background: rgba(248,81,73,.10); }

.inv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
.item-card {
  border: 1px solid color-mix(in srgb, var(--ic, #9ca3af) 30%, transparent);
  background: rgba(0,0,0,.22);
  border-radius: 16px; padding: 14px;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  text-align: center;
  transition: border-color 120ms, transform 100ms;
}
.item-card:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--ic, #9ca3af) 60%, transparent); }
.item-icon { font-size: 42px; line-height: 1; filter: drop-shadow(0 4px 12px rgba(0,0,0,.5)); }
.item-rarity { font-size: 11px; font-weight: 900; letter-spacing: .5px; text-transform: uppercase; }
.item-name { font-weight: 900; font-size: 13px; }
.item-value { font-size: 12px; }
.item-listed { display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 12px; }
.item-actions { display: flex; flex-direction: column; gap: 6px; width: 100%; margin-top: 4px; }
.item-sell-btn { width: 100%; height: 32px; border-radius: 10px; font-size: 11px; }
.item-vendor-btn { width: 100%; height: 32px; border-radius: 10px; font-size: 11px; background: rgba(74,222,128,.10); border-color: rgba(74,222,128,.25); color: #4ade80; }
.item-vendor-btn:hover { background: rgba(74,222,128,.18); border-color: rgba(74,222,128,.45); }
.btn-sm { height: 28px; padding: 0 10px; font-size: 11px; border-radius: 8px; }
.vendor-item-preview { display: flex; align-items: center; gap: 14px; padding: 12px; border: 1px solid rgba(255,255,255,.08); border-radius: 14px; background: rgba(0,0,0,.18); }

.field { display: flex; flex-direction: column; gap: 6px; }
.label { font-size: 13px; color: var(--muted); }
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal-box { width: min(360px, 90vw); padding: 20px; border-radius: 18px; border: 1px solid rgba(255,255,255,.10); }
.row { display: flex; align-items: center; }
</style>
