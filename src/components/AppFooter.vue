<script setup lang="ts"></script>

<template>
  <footer class="site-footer">
    <div class="wrap">
      <div class="center">
        <div class="mark" aria-hidden="true">S</div>
        <div class="name">SHARA</div>

        <div class="meta">
          <div>Contact us at <span class="em">support@stake.us</span>. For press inquiries, please contact <span class="em">press@stake.us</span>.</div>
          <div>Sopov Entertainment · All rights reserved.</div>
        </div>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.site-footer{
  margin-top: 22px;
  border-top: 1px solid rgba(58,74,138,.32);
  background: linear-gradient(180deg, rgba(10,12,18,.3), rgba(10,12,18,.88));
}
.wrap{
  max-width: 1100px;
  margin: 0 auto;
  padding: 18px 16px;
  display:flex;
  align-items:center;
  justify-content:center;
}
.center{ display:flex; flex-direction:column; align-items:center; gap: 8px; }
.mark{
  width: 44px; height: 44px;
  border-radius: 14px;
  display:grid; place-items:center;
  font-weight: 1000;
  letter-spacing: .06em;
  color: rgba(255,255,255,.92);
  border: 1px solid rgba(255,255,255,.14);
  background: radial-gradient(circle at 30% 30%, rgba(90,180,255,.28), rgba(255,255,255,.03));
  box-shadow: 0 18px 34px rgba(0,0,0,.35), 0 0 26px rgba(90,180,255,.10);
}
.name{ font-weight: 900; letter-spacing: .18em; color: rgba(255,255,255,.78); font-size: 12px; }
.meta{
  margin-top: 10px;
  text-align:center;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(255,255,255,.55);
  max-width: 720px;
}
.em{ color: rgba(255,255,255,.78); font-weight: 700; }
</style>
