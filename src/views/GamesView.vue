<template>
  <div class="grid" style="gap:16px;">
    <div class="card">
      <h2 style="margin:0;">{{ $t('ui.s_b7ccc175d0') }}</h2>
      <p class="muted" style="margin-top:8px;">
        {{ $t('ui.s_235e44683b') }}
      </p>
      <div class="row" style="margin-top:12px;">
        <RouterLink class="btn btn-primary" to="/roulette">{{ $t('ui.s_3cf6443ea2') }}</RouterLink>
        <RouterLink class="btn" to="/mines">{{ $t('ui.s_dafc16c30a') }}</RouterLink>
      <div class="card2 row-between" style="gap:12px;">
  <div>
    <b>{{ $t('ui.s_6643fdd61a') }}</b>
    <div class="muted">{{ $t('ui.s_c099dc0228') }}</div>
  </div>
  <RouterLink class="btn btn-primary" to="/plinko">{{ $t('ui.s_de3c731be5') }}</RouterLink>
</div>

</div>
    </div>
  </div>
</template>
