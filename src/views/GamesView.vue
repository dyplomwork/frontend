<template>
  <div class="grid" style="gap:16px;">
    <div class="card">
      <h2 style="margin:0;">Режимы игры</h2>
      <p class="muted" style="margin-top:8px;">
        Режимы доступны для просмотра всем, но играть можно только после входа.
      </p>
      <div class="row" style="margin-top:12px;">
        <RouterLink class="btn btn-primary" to="/roulette">Roulette</RouterLink>
        <RouterLink class="btn" to="/mines">Mineswapper</RouterLink>
      <div class="card2 row-between" style="gap:12px;">
  <div>
    <b>Plinko</b>
    <div class="muted">Шарик падает по штырькам и попадает в множитель.</div>
  </div>
  <RouterLink class="btn btn-primary" to="/plinko">Play</RouterLink>
</div>

</div>
    </div>
  </div>
</template>
