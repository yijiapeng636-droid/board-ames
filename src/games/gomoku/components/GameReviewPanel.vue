<script setup lang="ts">
import type { GameReview, ReviewPhase, ReviewPoint } from '@/games/gomoku/types/gomoku'
import { formatGomokuCoordinate } from '@/games/gomoku/core/coordinate'

defineProps<{
  phase: ReviewPhase
  points: ReviewPoint[]
  review: GameReview | null
  error: string
}>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <section v-if="phase !== 'idle'" class="review" aria-live="polite">
    <h2>赛后 AI 复盘</h2>
    <p v-if="phase === 'analyzing'">正在重放棋局并搜索关键回合…</p>
    <p v-else-if="phase === 'requestingAI'">本地分析完成，AI 教练正在整理建议…</p>
    <p v-if="review">{{ review.summary }}</p>
    <ol v-if="points.length" class="moments">
      <li v-for="point in points" :key="point.moveNumber">
        第 {{ point.moveNumber }} 手（{{ point.player === 'black' ? '黑方' : '白方' }}）：实战
        {{ formatGomokuCoordinate(point.playedMove) }}，建议
        {{ formatGomokuCoordinate(point.recommendedMove) }}
        <template v-if="review?.keyMoments.find((item) => item.moveNumber === point.moveNumber)">
          —
          {{ review.keyMoments.find((item) => item.moveNumber === point.moveNumber)?.explanation }}
        </template>
      </li>
    </ol>
    <div v-if="review" class="teaching">
      <p><strong>做得不错：</strong>{{ review.strengths.join('；') || '继续保持主动观察。' }}</p>
      <p>
        <strong>重点改进：</strong>{{ review.recurringIssues.join('；') || '暂无明显重复问题。' }}
      </p>
      <p><strong>练习建议：</strong>{{ review.practiceSuggestions.join('；') }}</p>
    </div>
    <p v-if="phase === 'error'" class="error">
      {{ error }}（上方本地关键点仍然有效）
      <button type="button" @click="$emit('retry')">重试 AI 总结</button>
    </p>
  </section>
</template>

<style scoped>
.review {
  margin-top: 1.25rem;
  padding: 1rem;
  border: 1px solid var(--panel-border, #c8ae86);
  border-radius: 10px;
  background: var(--panel-bg, #fffaf0);
}
.review h2 {
  margin: 0 0 0.75rem;
  font-size: 1.2rem;
}
.moments {
  padding-left: 1.5rem;
}
.moments li,
.teaching p {
  margin: 0.45rem 0;
}
.error {
  color: #b42318;
}
.error button {
  margin-left: 0.5rem;
}
</style>
