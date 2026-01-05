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
          <div class="value">{{ fmt(balance, 2) }} <span class="coin" aria-label="Currency K">K</span></div>
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
.game{display:flex;align-items:center;gap:12px;transition:transform .12s ease}
.game:hover{transform:translateY(-2px)}
.icon{font-size:26px;width:44px;height:44px;display:grid;place-items:center;border-radius:14px;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.08)}
.title{font-weight:1000}
.row-between{display:flex;align-items:center;justify-content:space-between;gap:10px}
.badge{font-weight:900;font-size:12px;padding:6px 10px;border-radius:999px;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.10)}
.stat{padding:12px;border-radius:14px;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.08)}
.stat .label{font-size:12px;color:rgba(255,255,255,.6);font-weight:800}
.stat .value{font-size:16px;font-weight:1000}


/* Home refinements */
.hero{
  background: radial-gradient(900px 420px at 10% 0%, rgba(92,255,146,.12), transparent 60%),
              radial-gradient(700px 360px at 90% 10%, rgba(56,189,248,.10), transparent 55%),
              rgba(255,255,255,.03);
  border: 1px solid rgba(255,255,255,.10);
}
.game .icon{
  background: radial-gradient(circle at 30% 30%, rgba(255,255,255,.10), rgba(0,0,0,.22));
  border: 1px solid rgba(255,255,255,.10);
}


/* Layout tuning for Home */
.home{ max-width: 1180px; margin: 0 auto; }
.hero.card{ padding: 22px; min-height: 210px; }
.hero-left{ max-width: 560px; }
.hero-right{ display:grid; grid-template-columns: repeat(2, minmax(160px, 1fr)); gap: 12px; align-content:start; }
.stat{ min-height: 72px; padding: 14px; }
.grid{ grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
.game.card{ min-height: 86px; padding: 14px 16px; }
.game .icon{ width: 48px; height: 48px; border-radius: 14px; display:grid; place-items:center; }

</style>
