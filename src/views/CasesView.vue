<script setup lang="ts">
import { onMounted } from 'vue'
import { useGameStore } from '../stores/game'
import { sfx } from '../utils/sfx'
import { formatNumber } from '../utils/format'
const game = useGameStore()

onMounted(() => {
  game.loadCases().catch(() => {})
})

const fmt = (v: number | string, d = 0) => formatNumber(v, d)

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
</script>

<template>
  <div class="app-page">
    <div class="game-card">
      <div class="header">
        <div>
          <h2>{{ $t('ui.s_b1f0b866ff') }}</h2>
          <p class="muted">{{ $t('ui.s_72fecc72fc') }}</p>
        </div>
      </div>

      <div class="cases-grid">
        <RouterLink
          v-for="c in game.cases"
          :key="c.id"
          class="case-tile"
          :to="`/cases/${c.id}`"
          @click="sfx('click')"
        >
          <div class="tile-top">
            <div class="emoji">{{ c.modelEmoji }}</div>
            <div class="name">{{ c.name }}</div>
            <div class="price">{{ fmt(c.price, 0) }} <span class="coin">K</span></div>
          </div>

          <div class="loot-preview">
            <div
              v-for="l in c.loot.slice(0,4)"
              :key="l.id"
              class="loot-chip"
              :class="rarity(l.amount)"
              :title="l.label"
            >
              <span class="ic" aria-hidden="true">{{ lootIcon(l.amount) }}</span>
              <span class="txt">{{ l.amount }}</span>
            </div>
          </div>

          <div class="tile-bottom">
            <span class="pill">{{ $t('ui.s_4351cfebe4') }}</span>
          </div>
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-page{ padding: 18px 8px 34px; }
.game-card{
  background: rgba(14,26,36,.72);
  border: 1px solid rgba(255,255,255,.06);
  border-radius: 18px;
  box-shadow: 0 18px 40px rgba(0,0,0,.35);
  overflow: hidden;
  padding: 18px;
}
.header{ display:flex; align-items:flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
h2{ margin:0; color: #eaf3ff; }
.muted{ margin: 6px 0 0; color: rgba(255,255,255,.68); }
.cases-grid{
  display:grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}
.case-tile{
  text-decoration:none;
  border: 1px solid rgba(255,255,255,.08);
  background: rgba(255,255,255,.03);
  border-radius: 16px;
  padding: 14px;
  color: rgba(255,255,255,.92);
  transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease;
}
.case-tile:hover{
  transform: translateY(-2px);
  border-color: rgba(90,180,255,.22);
  box-shadow: 0 16px 40px rgba(0,0,0,.32), 0 0 26px rgba(90,180,255,.10);
}
.tile-top{ display:flex; flex-direction:column; gap: 8px; }
.emoji{ font-size: 56px; line-height: 1; filter: drop-shadow(0 10px 18px rgba(0,0,0,.35)); }
.name{ font-weight: 900; }
.price{ color: rgba(255,255,255,.72); font-weight: 800; display:flex; align-items:center; gap: 8px; }
.tile-bottom{ margin-top: 12px; display:flex; justify-content:flex-end; }
.loot-preview{ display:flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.loot-chip{
  display:flex; align-items:center; gap: 6px;
  padding: 6px 8px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.10);
  background: rgba(255,255,255,.03);
  font-weight: 900;
  font-size: 12px;
  color: rgba(255,255,255,.88);
}
.loot-chip .ic{ filter: drop-shadow(0 8px 14px rgba(0,0,0,.35)); }
.loot-chip.common{ border-color: rgba(255,255,255,.10); }
.loot-chip.rare{ border-color: rgba(90,180,255,.28); }
.loot-chip.epic{ border-color: rgba(255,115,220,.30); }
.loot-chip.legendary{ border-color: rgba(255,208,90,.32); }
.pill{ padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,.10); background: rgba(255,255,255,.04); color: rgba(255,255,255,.82); font-weight: 800; }

</style>
