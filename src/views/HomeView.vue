<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="home">
    <div class="hero card">
      <div class="hero-welcome">
        <h1>{{ $t('ui.s_e152e62605') }}</h1>
        <p>{{ $t('ui.s_eda9fd1f8b') }}</p>
      </div>
    </div>

    <div class="grid">
      <RouterLink class="game card" to="/roulette">
        <div class="icon"><img src="/icon/roulette.png" alt="Roulette" /></div>
        <div class="meta">
          <div class="title">{{ $t('ui.s_3cf6443ea2') }}</div>
          <div class="muted">{{ $t('ui.s_17e45c77d3') }}</div>
        </div>
      </RouterLink>

      <RouterLink class="game card" to="/plinko">
        <div class="icon"><img src="/icon/plinko.png" alt="Plinko" /></div>
        <div class="meta">
          <div class="title">{{ $t('ui.s_6643fdd61a') }}</div>
          <div class="muted">{{ $t('ui.s_e09fbe469f') }}</div>
        </div>
      </RouterLink>

      <RouterLink class="game card" to="/mines">
        <div class="icon"><img src="/icon/mines.png" alt="Mines" /></div>
        <div class="meta">
          <div class="title">{{ $t('ui.s_c3fc302af4') }}</div>
          <div class="muted">{{ $t('ui.s_d212d1ac25') }}</div>
        </div>
      </RouterLink>

      <RouterLink class="game card" to="/cases">
        <div class="icon"><img src="/icon/cases.png" alt="Cases" /></div>
        <div class="meta">
          <div class="title">{{ $t('ui.s_b1f0b866ff') }}</div>
          <div class="muted">{{ $t('ui.s_03480973d3') }}</div>
        </div>
      </RouterLink>

      <RouterLink class="game card" to="/dice">
        <div class="icon"><img src="/icon/dice.png" alt="Dice" /></div>
        <div class="meta">
          <div class="title">{{ $t('ui.s_a5b6cdb9de') }}</div>
          <div class="muted">{{ $t('ui.s_35079404ba') }}</div>
        </div>
      </RouterLink>

      <RouterLink class="game card" to="/coinflip">
        <div class="icon"><img src="/icon/coinflip.png" alt="Coin Flip" /></div>

        <div class="meta">
          <div class="title">{{ $t('ui.s_24397a9d6f') }}</div>
          <div class="muted">{{ $t('ui.s_0c54815c09') }}</div>
        </div>
      </RouterLink>

      <RouterLink class="game card game-card-clicker" to="/clicker">
        <div class="icon emoji-icon">🪙</div>
        <div class="meta">
          <div class="title">{{ $t('ui.s_clicker') }}</div>
          <div class="muted">{{ $t('ui.s_home_clicker_desc') }}</div>
        </div>
      </RouterLink>

      <RouterLink class="game card game-card-inventory" to="/inventory">
        <div class="icon emoji-icon">🎒</div>
        <div class="meta">
          <div class="title">{{ $t('ui.s_inventory') }}</div>
          <div class="muted">{{ $t('ui.s_home_inventory_desc') }}</div>
        </div>
      </RouterLink>

      <RouterLink class="game card game-card-auction" to="/auction">
        <div class="icon emoji-icon">🏷️</div>
        <div class="meta">
          <div class="title">{{ $t('ui.s_auction') }}</div>
          <div class="muted">{{ $t('ui.s_home_auction_desc') }}</div>
        </div>
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
@media (max-width: 900px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
.card {
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  padding: 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  text-decoration: none;
  color: inherit;
}
.hero {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 34px 16px;
}
.hero-welcome {
  text-align: center;
  max-width: 740px;
}
.hero-welcome h1 {
  margin: 0;
  font-size: 34px;
  font-weight: 1000;
  letter-spacing: 0.6px;
  color: rgba(255, 214, 140, 0.98);
  text-shadow: 0 0 26px rgba(255, 122, 24, 0.18);
}
.hero-welcome p {
  margin: 10px 0 0;
  color: rgba(255, 255, 255, 0.78);
  font-weight: 900;
}
.game {
  display: flex;
  gap: 14px;
  align-items: center;
  transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease;
}
.game:hover {
  transform: translateY(-2px);
  border-color: rgba(255, 178, 74, 0.22);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.32), 0 0 26px rgba(255, 122, 24, 0.1);
}
.icon img {
  width: 50px;
  height: 50px;
  object-fit: contain;
  filter: drop-shadow(0 10px 18px rgba(0, 0, 0, 0.35));
}
.emoji-icon {
  font-size: 46px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 50px;
  height: 50px;
  filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.4));
}
.game-card-clicker:hover { border-color: rgba(255, 215, 0, 0.3); box-shadow: 0 16px 40px rgba(0,0,0,.32), 0 0 26px rgba(255,215,0,.12); }
.game-card-inventory:hover { border-color: rgba(52, 211, 153, 0.3); box-shadow: 0 16px 40px rgba(0,0,0,.32), 0 0 26px rgba(52,211,153,.12); }
.game-card-auction:hover { border-color: rgba(251, 146, 60, 0.3); box-shadow: 0 16px 40px rgba(0,0,0,.32), 0 0 26px rgba(251,146,60,.12); }
.meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.title {
  font-weight: 1000;
  color: rgba(255, 248, 236, 0.92);
}
.muted {
  color: rgba(255, 255, 255, 0.68);
  font-weight: 800;
  font-size: 12px;
}
</style>
