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
            <img class="case-ic" :src="`/icon/${c.id}.png`" :alt="c.name" />
            <div class="name">{{ c.name }}</div>
            <div class="price">{{ fmt(c.price, 0) }} <span class="coin">K</span></div>
          </div>

          <div class="tile-bottom">
            <span class="open-btn">{{ $t('ui.s_4351cfebe4') }}</span>
          </div>
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-page{ padding: 18px 8px 34px; }
.game-card{
  background: rgba(20,20,15,.74);
  border: 1px solid rgba(255,255,255,.06);
  border-radius: 18px;
  box-shadow: 0 18px 40px rgba(0,0,0,.35);
  overflow: hidden;
  padding: 18px;
}
.header{ display:flex; align-items:flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
h2{ margin:0; color: rgba(255,248,236,.92); }
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
  display:flex;
  flex-direction: column;
  align-items: center;
}
.case-tile:hover{
  transform: translateY(-2px);
  border-color: rgba(255,178,74,.22);
  box-shadow: 0 16px 40px rgba(0,0,0,.32), 0 0 26px rgba(255,122,24,.10);
}
.tile-top{ display:flex; flex-direction:column; align-items:center; text-align:center; gap: 10px; width: 100%; }
.case-ic{ width: 62px; height: 62px; display:block; object-fit: contain; filter: drop-shadow(0 10px 18px rgba(0,0,0,.35)); }
.name{ font-weight: 1000; }
.price{ color: rgba(255,255,255,.76); font-weight: 900; display:flex; align-items:center; justify-content:center; gap: 8px; }
.tile-bottom{ margin-top: 14px; width: 100%; }
.open-btn{
  width: 100%;
  height: 42px;
  display:flex;
  align-items:center;
  justify-content:center;
  border-radius: 12px;
  background: rgba(255,178,74,.14);
  border: 1px solid rgba(255,178,74,.28);
  color: rgba(255,248,236,.92);
  font-weight: 1000;
  box-shadow: 0 10px 22px rgba(0,0,0,.28), 0 0 22px rgba(255,122,24,.10);
}

</style>
