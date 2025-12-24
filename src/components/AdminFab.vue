<script setup lang="ts">
import { useRouter } from 'vue-router'
import { sfx } from '../utils/sfx'
const router = useRouter()
function go(){
  sfx('click')
  router.push('/admin')
}
</script>

<template>
  <button class="admin-fab" @click="go" title="Admin">
    🛡️
  </button>
</template>

<style scoped>
.admin-fab{
  position: fixed;
  right: 18px;
  bottom: 18px;
  width: 56px;
  height: 56px;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,.10);
  background: linear-gradient(180deg, rgba(35,57,74,.9), rgba(24,39,52,.9));
  box-shadow:
    0 12px 30px rgba(0,0,0,.45),
    0 0 0 1px rgba(80,170,255,.18),
    0 0 20px rgba(65,150,255,.22);
  color: #d7e9ff;
  font-size: 22px;
  cursor: pointer;
  z-index: 60;
  display: grid;
  place-items: center;
  transition: transform .15s ease, box-shadow .15s ease, filter .15s ease;
  filter: saturate(1.1);
}
.admin-fab:hover{
  transform: translateY(-2px);
  box-shadow:
    0 16px 34px rgba(0,0,0,.50),
    0 0 0 1px rgba(80,170,255,.24),
    0 0 28px rgba(65,150,255,.32);
}
.admin-fab:active{ transform: translateY(0px) scale(.98); }
</style>