<script setup lang="ts">
import { BOARD_SIZE, type AIMove, type Board } from '@/games/gomoku/types/gomoku'

defineProps<{
  board: Board
  disabled: boolean
  hintMove?: AIMove | null
  displaySize?: 'small' | 'medium' | 'large'
  palette?: 'wood' | 'slate' | 'vscode'
}>()
const emit = defineEmits<{ place: [row: number, col: number] }>()
</script>

<template>
  <div
    class="board"
    :class="[`board-${displaySize ?? 'medium'}`, `palette-${palette ?? 'wood'}`]"
    :style="{ '--board-size': BOARD_SIZE }"
    role="grid"
    :aria-label="`${BOARD_SIZE} × ${BOARD_SIZE} 五子棋棋盘`"
  >
    <template v-for="(line, row) in board" :key="row">
      <button
        v-for="(piece, col) in line"
        :key="`${row}-${col}`"
        class="cell"
        :class="{
          occupied: piece !== 0,
          hint: hintMove?.row === row && hintMove?.col === col && piece === 0,
        }"
        type="button"
        role="gridcell"
        :aria-label="`第 ${row + 1} 行第 ${col + 1} 列，${piece === 1 ? '黑棋' : piece === 2 ? '白棋' : '空位'}`"
        :disabled="disabled || piece !== 0"
        @click="emit('place', row, col)"
      >
        <span v-if="piece" class="piece" :class="piece === 1 ? 'black' : 'white'" />
      </button>
    </template>
  </div>
</template>

<style scoped>
.board {
  --board-background: #d8a95f;
  --board-grid: #75501f;
  --board-border: #77501f;
  display: grid;
  grid-template-columns: repeat(var(--board-size), var(--cell-size));
  width: fit-content;
  padding: calc(var(--cell-size) / 2);
  background: var(--board-background);
  border: 2px solid var(--board-border);
  box-shadow: 0 8px 24px rgb(40 28 14 / 18%);
}
.palette-slate {
  --board-background: #4b5563;
  --board-grid: #94a3b8;
  --board-border: #1f2937;
}
.palette-vscode {
  --board-background: #1e1e1e;
  --board-grid: #2f2f2f;
  --board-border: #333;
  border-width: 1px;
  box-shadow: none;
}
.board-small {
  --cell-size: clamp(16px, 3.5vw, 26px);
}
.board-medium {
  --cell-size: clamp(20px, 4.7vw, 36px);
}
.board-large {
  --cell-size: clamp(24px, 5.7vw, 44px);
}
.cell {
  position: relative;
  width: var(--cell-size);
  height: var(--cell-size);
  padding: 0;
  border: 0;
  background:
    linear-gradient(var(--board-grid), var(--board-grid)) center / 100% 1px no-repeat,
    linear-gradient(90deg, var(--board-grid), var(--board-grid)) center / 1px 100% no-repeat;
  cursor: pointer;
}
.cell:not(:disabled):hover::after,
.cell:not(:disabled):focus-visible::after {
  position: absolute;
  inset: 23%;
  border-radius: 50%;
  background: rgb(25 25 25 / 24%);
  content: '';
}
.cell.hint::before {
  position: absolute;
  z-index: 2;
  inset: 15%;
  border: 3px solid #e43d30;
  border-radius: 50%;
  background: rgb(255 245 157 / 55%);
  content: '';
  animation: pulse 1s ease-in-out infinite alternate;
}
.cell:focus-visible {
  z-index: 3;
  outline: 2px solid #0b5fff;
}
.cell:disabled:not(.occupied) {
  cursor: not-allowed;
}
.piece {
  position: absolute;
  z-index: 1;
  inset: 9%;
  display: block;
  border-radius: 50%;
  box-shadow: 1px 2px 4px rgb(0 0 0 / 35%);
}
.black {
  background: radial-gradient(circle at 35% 28%, #555, #111 55%, #000);
}
.white {
  border: 1px solid #bbb;
  background: radial-gradient(circle at 35% 28%, #fff, #eee 62%, #ccc);
}
.palette-vscode .piece {
  inset: 27%;
  border: 0;
  border-radius: 2px;
  box-shadow: none;
}
.palette-vscode .black {
  background: #569cd6;
}
.palette-vscode .white {
  background: #ce9178;
}
.palette-vscode .cell.hint::before {
  inset: 25%;
  border: 1px solid #dcdcaa;
  border-radius: 2px;
  background: rgb(220 220 170 / 18%);
}
@keyframes pulse {
  to {
    transform: scale(0.88);
  }
}
</style>
