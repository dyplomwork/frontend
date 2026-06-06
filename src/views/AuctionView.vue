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

type Listing = {
  id: string; sellerId: string; sellerNick: string;
  itemId: string; itemDefId: string;
  name: string; nameUa: string; rarity: string; icon: string; color: string;
  baseValue: number; price: number;
  status: string; buyerId: string | null; buyerNick: string | null;
  createdAt: string;
}

const listings = ref<Listing[]>([])
const loading = ref(false)
const buyBusy = ref<string | null>(null)
const filterRarity = ref('')
const searchQuery = ref('')
const sortBy = ref<'price_asc'|'price_desc'|'rarity'>('price_asc')
const msg = ref('')
const msgType = ref<'success'|'error'>('success')
const confirmListing = ref<Listing | null>(null)

const RARITIES = ['common','uncommon','rare','epic','legendary','mythic']
const RARITY_ORDER: Record<string,number> = { common:0, uncommon:1, rare:2, epic:3, legendary:4, mythic:5 }
const RARITY_KEY: Record<string, string> = {
  common: 's_rarity_common', uncommon: 's_rarity_uncommon',
  rare: 's_rarity_rare', epic: 's_rarity_epic',
  legendary: 's_rarity_legendary', mythic: 's_rarity_mythic',
}

const fmt = (v: number) => formatNumber(v, 2)

function itemName(item: Listing) { return locale.value === 'ua' ? item.nameUa : item.name }
function rarityLabel(r: string) { return t(`ui.${RARITY_KEY[r] ?? 's_rarity_common'}`) }

const filtered = computed(() => {
  let list = listings.value
  if (filterRarity.value) list = list.filter(l => l.rarity === filterRarity.value)
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(l => l.name.toLowerCase().includes(q) || l.nameUa.toLowerCase().includes(q) || l.sellerNick.toLowerCase().includes(q))
  }
  if (sortBy.value === 'price_asc') list = [...list].sort((a,b) => a.price - b.price)
  else if (sortBy.value === 'price_desc') list = [...list].sort((a,b) => b.price - a.price)
  else list = [...list].sort((a,b) => (RARITY_ORDER[b.rarity]??0) - (RARITY_ORDER[a.rarity]??0))
  return list
})

async function load() {
  loading.value = true
  try {
    const res = await api<any>('/api/v1/auction', { method: 'GET' })
    listings.value = res.listings ?? []
  } catch (e: any) {
    ui.toast(e?.message ?? t('ui.s_error'), 'error')
  } finally {
    loading.value = false
  }
}

async function confirmBuy() {
  const listing = confirmListing.value
  if (!listing) return
  confirmListing.value = null
  await doBuy(listing)
}

async function buy(listing: Listing) {
  if (!auth.user) { ui.toast(t('ui.s_need_login'), 'info'); return }
  confirmListing.value = listing
}

async function doBuy(listing: Listing) {
  if (!auth.user) return
  buyBusy.value = listing.id
  msg.value = ''
  try {
    await api(`/api/v1/auction/${listing.id}/buy`, { method: 'POST' })
    msg.value = `Куплено: ${itemName(listing)}`
    msgType.value = 'success'
    // Balance refresh and listings reload are independent — run in parallel
    await Promise.all([auth.fetchBalance({ force: true }), load()])
  } catch (e: any) {
    msg.value = e?.message ?? t('ui.s_error')
    msgType.value = 'error'
  } finally {
    buyBusy.value = null
  }
}

onMounted(load)
</script>

<template>
  <GamePageLayout :min-height="560">
    <div class="auction-wrap">
      <div class="auction-head card">
        <div class="row-between">
          <div>
            <h2 style="margin:0">{{ $t('ui.s_auction') }}</h2>
            <div class="muted small">{{ $t('ui.s_auction_fee') }}</div>
          </div>
          <button class="btn" @click="load" :disabled="loading">↻</button>
        </div>

        <div class="controls" style="margin-top:12px;">
          <input class="input search-input" v-model="searchQuery" placeholder="Search..." />
          <select class="input sort-select" v-model="sortBy">
            <option value="price_asc">↑ Price</option>
            <option value="price_desc">↓ Price</option>
            <option value="rarity">Rarity</option>
          </select>
        </div>

        <div class="filter-row" style="margin-top:10px;">
          <button class="filter-chip" :class="{ on: !filterRarity }" @click="filterRarity = ''">{{ $t('ui.s_inventory_all') }}</button>
          <button
            v-for="r in RARITIES" :key="r"
            class="filter-chip" :class="{ on: filterRarity === r }"
            @click="filterRarity = filterRarity === r ? '' : r"
          >{{ rarityLabel(r) }}</button>
        </div>

        <div v-if="msg" class="notice" :class="msgType" style="margin-top:10px;">{{ msg }}</div>
      </div>

      <!-- Custom buy confirmation modal -->
    <div v-if="confirmListing" class="modal-backdrop" @click.self="confirmListing = null">
      <div class="modal-box">
        <div class="modal-header">
          <span style="font-size:32px;">{{ confirmListing.icon }}</span>
          <div>
            <div class="modal-item-name" :style="{ color: confirmListing.color }">{{ itemName(confirmListing) }}</div>
            <div class="muted small">{{ rarityLabel(confirmListing.rarity) }}</div>
          </div>
        </div>
        <div class="modal-price">{{ fmt(confirmListing.price) }} K</div>
        <div class="muted small" style="text-align:center">{{ $t('ui.s_auction_fee') }}</div>
        <div class="modal-actions">
          <button class="btn btn-primary" @click="confirmBuy">{{ $t('ui.s_auction_buy') }}</button>
          <button class="btn" @click="confirmListing = null">{{ $t('ui.s_cf_cancel') }}</button>
        </div>
      </div>
    </div>

    <div v-if="loading" class="muted pad">{{ $t('ui.s_43e40d49fd') }}</div>
      <div v-else-if="filtered.length === 0" class="muted pad">{{ $t('ui.s_auction_empty') }}</div>

      <div v-else class="listings-grid">
        <div
          v-for="l in filtered"
          :key="l.id"
          class="listing-card"
          :style="{ '--lc': l.color }"
        >
          <div class="listing-top">
            <span class="listing-icon">{{ l.icon }}</span>
            <div class="listing-meta">
              <div class="listing-rarity" :style="{ color: l.color }">{{ rarityLabel(l.rarity) }}</div>
              <div class="listing-name">{{ itemName(l) }}</div>
              <div class="listing-seller muted small">{{ $t('ui.s_auction_seller') }}: {{ l.sellerNick }}</div>
            </div>
          </div>
          <div class="listing-bottom">
            <div class="listing-price">{{ fmt(l.price) }} <span class="coin-unit">K</span></div>
            <button
              class="btn btn-primary listing-buy"
              :disabled="!!buyBusy || l.sellerId === auth.user?.id"
              @click="buy(l)"
            >
              {{ buyBusy === l.id ? '…' : (l.sellerId === auth.user?.id ? 'Mine' : $t('ui.s_auction_buy')) }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </GamePageLayout>
</template>

<style scoped>
.auction-wrap { width: min(1200px, 100%); margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }
.auction-head { border-radius: 18px; padding: 14px; border: 1px solid rgba(255,255,255,.08); }
.row-between { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.small { font-size: 12px; }
.pad { padding: 20px; }
.controls { display: flex; gap: 10px; flex-wrap: wrap; }
.search-input { flex: 1; min-width: 160px; }
.sort-select { width: 140px; background: rgba(0,0,0,.3); color: var(--text); }
.filter-row { display: flex; gap: 8px; flex-wrap: wrap; }
.filter-chip { padding: 6px 14px; border-radius: 999px; border: 1px solid rgba(255,255,255,.10); background: rgba(0,0,0,.18); color: rgba(255,255,255,.8); cursor: pointer; font-size: 12px; font-weight: 700; }
.filter-chip.on { background: rgba(255,255,255,.12); border-color: rgba(255,255,255,.3); }
.notice { padding: 10px 12px; border-radius: 12px; font-size: 13px; border: 1px solid rgba(255,255,255,.08); }
.notice.success { border-color: rgba(34,197,94,.35); background: rgba(34,197,94,.10); }
.notice.error { border-color: rgba(248,81,73,.35); background: rgba(248,81,73,.10); }

.listings-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.listing-card {
  border: 1px solid color-mix(in srgb, var(--lc, #9ca3af) 25%, transparent);
  background: rgba(0,0,0,.22); border-radius: 16px; padding: 14px;
  display: flex; flex-direction: column; gap: 12px;
  transition: border-color 120ms, transform 100ms;
}
.listing-card:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--lc, #9ca3af) 55%, transparent); }
.listing-top { display: flex; align-items: center; gap: 12px; }
.listing-icon { font-size: 38px; filter: drop-shadow(0 3px 8px rgba(0,0,0,.4)); }
.listing-meta { display: flex; flex-direction: column; gap: 3px; }
.listing-rarity { font-size: 11px; font-weight: 900; letter-spacing: .4px; text-transform: uppercase; }
.listing-name { font-weight: 900; }
.listing-seller { }
.listing-bottom { display: flex; align-items: center; justify-content: space-between; gap: 10px; border-top: 1px solid rgba(255,255,255,.06); padding-top: 10px; }
.listing-price { font-weight: 1000; font-size: 18px; }
.coin-unit { font-weight: 1000; opacity: .85; }
.listing-buy { height: 36px; border-radius: 10px; font-size: 13px; }

.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.65); display: flex; align-items: center; justify-content: center; z-index: 200; }
.modal-box { width: min(340px, 92vw); background: rgba(18,16,12,.96); border: 1px solid rgba(255,255,255,.12); border-radius: 20px; padding: 24px; display: flex; flex-direction: column; gap: 16px; box-shadow: 0 24px 60px rgba(0,0,0,.6); }
.modal-header { display: flex; align-items: center; gap: 14px; }
.modal-item-name { font-weight: 1000; font-size: 16px; }
.modal-price { font-size: 28px; font-weight: 1000; text-align: center; color: #ffd700; }
.modal-actions { display: flex; gap: 10px; }
.modal-actions .btn { flex: 1; height: 44px; border-radius: 12px; }
</style>
