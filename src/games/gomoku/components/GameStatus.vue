<script setup lang="ts">
import type { GamePhase, GameResult, Player } from '@/games/gomoku/types/gomoku'

const props = defineProps<{
  phase: GamePhase
  result: GameResult
  reason: string
  error: string
  humanPlayer: Player
  started: boolean
}>()
const statusText = () => {
  if (!props.started) return '等待开始对局'
  if (props.result === 'blackWin') return props.humanPlayer === 1 ? '你获胜' : 'AI 获胜'
  if (props.result === 'whiteWin') return props.humanPlayer === 2 ? '你获胜' : 'AI 获胜'
  if (props.result === 'draw') return '平局'
  if (props.phase === 'aiThinking') return 'AI 正在思考'
  if (props.phase === 'aiError') return 'AI 请求失败'
  return '轮到你'
}
</script>

<template>
  <section class="status" aria-live="polite">
    <p><strong>状态：</strong>{{ statusText() }}</p>
    <p v-if="reason"><strong>AI 说明：</strong>{{ reason }}</p>
    <p v-if="error" class="error"><strong>错误：</strong>{{ error }}</p>
  </section>
</template>

<style scoped>
.status {
  min-height: 4.5rem;
  margin: 1rem 0;
}
.status p {
  margin: 0.35rem 0;
}
.error {
  color: #b42318;
}
</style>
