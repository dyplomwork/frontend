<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { formatNumber } from '../utils/format'

const auth = useAuthStore()
const balance = computed(() => auth.user?.balance ?? 0)
const fmt = (v: number | string, d = 2) => formatNumber(v, d)
</script>

<template>
  <div class="home">
    <div class="hero card">
      <div class="hero-left">
        <div class="pill">SCXDROP • demo credits</div>
        <h1>Play casino-style games</h1>
        <p class="muted">
          Roulette, Plinko, Mines and Cases — in a clean Stake-like UI. Balance is stored locally for dev.
        </p>
        <div class="cta">
          <RouterLink class="btn primary" to="/roulette">Play now</RouterLink>
          <RouterLink class="btn" to="/cases">Open cases</RouterLink>
        </div>
      </div>
      <div class="hero-right">
        <div class="stat">
          <div class="label">Balance</div>
          <div class="value">{{ fmt(balance, 2) }} <span class="coin">K</span></div>
        </div>
        <div class="stat">
          <div class="label">Account</div>
          <div class="value">{{ auth.user ? auth.user.nickname : 'Guest' }}</div>
        </div>
      </div>
    </div>

    <div class="grid">
      <RouterLink class="game card" to="/roulette">
        <div class="icon">🎡</div>
        <div class="meta">
          <div class="title">Roulette</div>
          <div class="muted">Classic bets • history • repeat</div>
        </div>
      </RouterLink>

      <RouterLink class="game card" to="/plinko">
        <div class="icon">🔻</div>
        <div class="meta">
          <div class="title">Plinko</div>
          <div class="muted">Multi balls • bin glow • smooth drop</div>
        </div>
      </RouterLink>

      <RouterLink class="game card" to="/mines">
        <div class="icon">💣</div>
        <div class="meta">
          <div class="title">Mines</div>
          <div class="muted">Quick picks • cashout</div>
        </div>
      </RouterLink>

      <RouterLink class="game card" to="/cases">
        <div class="icon">🎁</div>
        <div class="meta">
          <div class="title">Cases</div>
          <div class="muted">Stake-minimal • odds table</div>
        </div>
      </RouterLink>

      <RouterLink class="game card" to="/dice">
        <div class="icon">🎲</div>
        <div class="meta">
          <div class="title">Dice</div>
          <div class="muted">Roll over • slider odds • needle</div>
        </div>
      </RouterLink>
    </div>

    <div class="card last">
      <div class="row-between">
        <h2>Quick guide</h2>
        <span class="badge">tips</span>
      </div>

      <div class="guide">
        <div class="gcard">
          <div class="gi">🎡</div>
          <div>
            <div class="gt">Roulette</div>
            <div class="gm">Ставь несколькими фишками • следи за total bet • выигрыш сразу в балансе</div>
          </div>
        </div>
        <div class="gcard">
          <div class="gi">🎲</div>
          <div>
            <div class="gt">Dice</div>
            <div class="gm">Payout считается на фронте • шанс = 100 − Roll Over • быстрее и без лишних запросов</div>
          </div>
        </div>
        <div class="gcard">
          <div class="gi">🔻</div>
          <div>
            <div class="gt">Plinko</div>
            <div class="gm">Реалистичное падение шаров • подсветка бинов • мульти-боллы</div>
          </div>
        </div>
        <div class="gcard">
          <div class="gi">💣</div>
          <div>
            <div class="gt">Mines</div>
            <div class="gm">Рандом-пики • кэш-аут в любой момент • мультипликатор растёт на каждом safe pick</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home{display:flex;flex-direction:column;gap:16px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
@media (max-width: 900px){.grid{grid-template-columns:1fr}}
.card{
  border-radius: 18px;
  border: 1px solid rgba(255,255,255,.08);
  background: rgba(255,255,255,.03);
  padding: 16px;
  box-shadow: 0 10px 30px rgba(0,0,0,.35);
  text-decoration:none;
  color: inherit;
}
.hero{display:flex;justify-content:space-between;gap:16px;align-items:stretch}
.hero-left{flex:1;min-width:260px}
.hero-right{display:flex;flex-direction:column;gap:10px;min-width:220px;justify-content:flex-end}
.pill{display:inline-flex;align-items:center;gap:8px;font-weight:800;font-size:12px;padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.15)}
h1{margin:10px 0 8px;font-size:34px;letter-spacing:.3px}
h2{margin:0;font-size:18px}
.muted{color:rgba(255,255,255,.65)}
.cta{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.10);background:rgba(0,0,0,.15);font-weight:900}
.btn.primary{background:rgba(0,255,140,.18);border-color:rgba(0,255,140,.35)}
.game{display:flex;align-items:center;gap:12px;transition:transform .12s ease}
.game:hover{transform:translateY(-2px)}
.icon{font-size:26px;width:44px;height:44px;display:grid;place-items:center;border-radius:14px;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.08)}
.title{font-weight:1000}
.row-between{display:flex;align-items:center;justify-content:space-between;gap:10px}
.badge{font-weight:900;font-size:12px;padding:6px 10px;border-radius:999px;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.10)}
.stat{padding:12px;border-radius:14px;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.08)}
.stat .label{font-size:12px;color:rgba(255,255,255,.6);font-weight:800}
.stat .value{font-size:16px;font-weight:1000}
.coin{opacity:.8;font-weight:1000;margin-left:6px}
.guide{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}
@media (max-width: 900px){.guide{grid-template-columns:1fr}}
.gcard{display:flex;gap:12px;align-items:flex-start;padding:12px;border-radius:14px;background:rgba(0,0,0,.14);border:1px solid rgba(255,255,255,.08)}
.gi{width:36px;height:36px;display:grid;place-items:center;border-radius:12px;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.08)}
.gt{font-weight:1000}
.gm{color:rgba(255,255,255,.65);font-size:12px;line-height:1.45;margin-top:4px}
</style>
