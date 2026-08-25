<script setup lang="ts">
import { ref } from 'vue'
import GomokuGame from '@/games/gomoku/GomokuGame.vue'
import XiangqiGame from '@/games/xiangqi/XiangqiGame.vue'

type ActiveGame = 'home' | 'gomoku' | 'xiangqi'
const activeGame = ref<ActiveGame>('home')
</script>

<template>
  <GomokuGame v-if="activeGame === 'gomoku'" @back="activeGame = 'home'" />
  <XiangqiGame v-else-if="activeGame === 'xiangqi'" @back="activeGame = 'home'" />
  <main v-else class="game-home">
    <p class="eyebrow">LOCAL AI BOARD LAB</p>
    <h1>AI 棋类练习器</h1>
    <p class="intro">选择一种棋类，进入本地规则引擎与 AI 辅助训练。</p>
    <div class="game-grid" aria-label="棋类选择">
      <button type="button" class="game-card gomoku-card" @click="activeGame = 'gomoku'">
        <span class="game-icon" aria-hidden="true">● ○</span>
        <strong>五子棋</strong>
        <small>搜索、提示、让子与赛后复盘</small>
      </button>
      <button type="button" class="game-card xiangqi-card" @click="activeGame = 'xiangqi'">
        <span class="game-icon" aria-hidden="true">楚 河</span>
        <strong>中国象棋</strong>
        <small>标准棋盘与规则训练模块</small>
      </button>
    </div>
  </main>
</template>

<style>
* {
  box-sizing: border-box;
}
body {
  min-width: 320px;
  min-height: 100vh;
  margin: 0;
  color: #241b11;
  background: #f5f1e8;
  font-family: system-ui, sans-serif;
}
button {
  font: inherit;
}
</style>

<style scoped>
.game-home {
  width: min(100% - 2rem, 820px);
  margin: 0 auto;
  padding: clamp(3rem, 10vh, 7rem) 0;
  text-align: center;
}
.eyebrow {
  margin: 0;
  color: #8b5e2f;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.18em;
}
.game-home h1 {
  margin: 0.5rem 0;
  font-size: clamp(2rem, 6vw, 3.4rem);
}
.intro {
  margin: 0 auto 2rem;
  color: #665b4e;
}
.game-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}
.game-card {
  display: grid;
  min-height: 210px;
  place-content: center;
  gap: 0.75rem;
  padding: 1.5rem;
  border: 1px solid #c9aa7d;
  border-radius: 16px;
  color: #241b11;
  background: #fffaf0;
  box-shadow: 0 10px 30px rgb(59 39 17 / 10%);
  cursor: pointer;
  transition:
    transform 150ms ease,
    box-shadow 150ms ease;
}
.game-card:hover,
.game-card:focus-visible {
  transform: translateY(-3px);
  box-shadow: 0 14px 34px rgb(59 39 17 / 18%);
}
.game-card strong {
  font-size: 1.45rem;
}
.game-card small {
  color: #665b4e;
}
.game-icon {
  color: #8b1d16;
  font-family: 'STKaiti', 'KaiTi', serif;
  font-size: 2.1rem;
}
.gomoku-card .game-icon {
  color: #242424;
}
@media (max-width: 560px) {
  .game-grid {
    grid-template-columns: 1fr;
  }
  .game-card {
    min-height: 170px;
  }
}
</style>
