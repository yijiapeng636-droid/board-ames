<script setup lang="ts">
import type {
  XiangqiBoard,
  XiangqiMove,
  XiangqiPiece,
  XiangqiPosition,
} from '@/games/xiangqi/types/xiangqi'

const props = defineProps<{
  board: XiangqiBoard
  selected: XiangqiPosition | null
  legalTargets: XiangqiPosition[]
  lastMove: XiangqiMove | null
  hintMove?: Pick<XiangqiMove, 'from' | 'to'> | null
  checkedGeneral?: XiangqiPosition | null
  displaySize?: 'small' | 'medium' | 'large'
  palette?: 'wood' | 'slate' | 'vscode'
}>()

const emit = defineEmits<{ select: [position: XiangqiPosition] }>()

const names: Record<XiangqiPiece['type'], { red: string; black: string }> = {
  general: { red: '帅', black: '将' },
  advisor: { red: '仕', black: '士' },
  elephant: { red: '相', black: '象' },
  horse: { red: '马', black: '马' },
  rook: { red: '车', black: '车' },
  cannon: { red: '炮', black: '炮' },
  pawn: { red: '兵', black: '卒' },
}

function samePosition(left: XiangqiPosition | null | undefined, row: number, col: number) {
  return left?.row === row && left.col === col
}

function isLegalTarget(row: number, col: number) {
  return props.legalTargets.some((target) => samePosition(target, row, col))
}

function pieceName(piece: XiangqiPiece) {
  return names[piece.type][piece.side]
}
</script>

<template>
  <div
    class="xiangqi-board"
    :class="[`board-${displaySize ?? 'medium'}`, `palette-${palette ?? 'wood'}`]"
    role="grid"
    aria-label="10 × 9 中国象棋棋盘"
  >
    <svg class="palaces" viewBox="0 0 8 9" aria-hidden="true">
      <path d="M3 0L5 2M5 0L3 2M3 7L5 9M5 7L3 9" />
    </svg>
    <span class="river river-left" aria-hidden="true">楚河</span>
    <span class="river river-right" aria-hidden="true">汉界</span>
    <template v-for="(line, row) in board" :key="row">
      <button
        v-for="(piece, col) in line"
        :key="`${row}-${col}`"
        type="button"
        role="gridcell"
        class="intersection"
        :class="{
          selected: samePosition(selected, row, col),
          legal: isLegalTarget(row, col),
          'last-from': samePosition(lastMove?.from, row, col),
          'last-to': samePosition(lastMove?.to, row, col),
          'hint-from': samePosition(hintMove?.from, row, col),
          'hint-to': samePosition(hintMove?.to, row, col),
          checked: samePosition(checkedGeneral, row, col),
        }"
        :aria-label="`第 ${row + 1} 行第 ${col + 1} 列，${piece ? `${piece.side === 'red' ? '红方' : '黑方'}${pieceName(piece)}` : '空位'}`"
        @click="emit('select', { row, col })"
      >
        <span v-if="piece" class="xiangqi-piece" :class="piece.side">
          {{ pieceName(piece) }}
        </span>
        <span v-else-if="isLegalTarget(row, col)" class="target-dot" aria-hidden="true" />
      </button>
    </template>
  </div>
</template>

<style scoped>
.xiangqi-board {
  --cell: clamp(34px, 8vw, 58px);
  --board-background: #e1b66f;
  --board-grid: #795226;
  --board-border: #6f451e;
  --piece-background: #f4d393;
  position: relative;
  display: grid;
  grid-template-columns: repeat(9, var(--cell));
  grid-template-rows: repeat(10, var(--cell));
  width: fit-content;
  padding: calc(var(--cell) / 2);
  border: 3px solid var(--board-border);
  background: var(--board-background);
  box-shadow: 0 8px 24px rgb(47 29 12 / 20%);
}
.board-small {
  --cell: clamp(28px, 6.5vw, 44px);
}
.board-large {
  --cell: clamp(40px, 9.5vw, 68px);
}
.palette-slate {
  --board-background: #4b5563;
  --board-grid: #94a3b8;
  --board-border: #1f2937;
  --piece-background: #d7c7aa;
}
.palette-vscode {
  --board-background: #1e1e1e;
  --board-grid: #2f2f2f;
  --board-border: #333;
  border-width: 1px;
  box-shadow: none;
}
.intersection {
  position: relative;
  z-index: 2;
  width: var(--cell);
  height: var(--cell);
  padding: 0;
  border: 0;
  background:
    linear-gradient(var(--board-grid), var(--board-grid)) center / 100% 1px no-repeat,
    linear-gradient(90deg, var(--board-grid), var(--board-grid)) center / 1px 100% no-repeat;
  cursor: pointer;
}
.intersection:focus-visible {
  z-index: 4;
  outline: 3px solid #0969da;
}
.xiangqi-piece {
  position: absolute;
  z-index: 3;
  inset: 7%;
  display: grid;
  place-items: center;
  border: 2px solid currentcolor;
  border-radius: 50%;
  background: var(--piece-background);
  box-shadow: 1px 2px 4px rgb(0 0 0 / 30%);
  font-family: 'STKaiti', 'KaiTi', serif;
  font-size: calc(var(--cell) * 0.5);
  font-weight: 700;
}
.xiangqi-piece.red {
  color: #b42318;
}
.xiangqi-piece.black {
  color: #202020;
}
.intersection.selected .xiangqi-piece {
  outline: 4px solid #0969da;
  outline-offset: 2px;
}
.intersection.last-from::after,
.intersection.last-to::after,
.intersection.hint-from::after,
.intersection.hint-to::after,
.intersection.checked::after {
  position: absolute;
  z-index: 4;
  inset: 9%;
  border: 3px solid #c97a12;
  border-radius: 50%;
  content: '';
  pointer-events: none;
}
.intersection.hint-from::after,
.intersection.hint-to::after {
  border-color: #0969da;
}
.intersection.checked::after {
  border-color: #d1242f;
  animation: check-pulse 0.8s alternate infinite;
}
.target-dot {
  position: absolute;
  z-index: 3;
  inset: 36%;
  border-radius: 50%;
  background: #0969da;
}
.palaces {
  position: absolute;
  z-index: 1;
  inset: calc(var(--cell) / 2);
  width: calc(var(--cell) * 8);
  height: calc(var(--cell) * 9);
  overflow: visible;
  pointer-events: none;
}
.palaces path {
  fill: none;
  stroke: var(--board-grid);
  stroke-width: 0.025;
}
.river {
  position: absolute;
  z-index: 1;
  top: 50%;
  color: var(--board-grid);
  background: var(--board-background);
  font-family: 'STKaiti', 'KaiTi', serif;
  font-size: calc(var(--cell) * 0.42);
  letter-spacing: 0.3em;
  transform: translateY(-50%);
  pointer-events: none;
}
.river-left {
  left: 23%;
}
.river-right {
  right: 20%;
}
.palette-vscode .xiangqi-piece {
  inset: 27%;
  border: 0;
  border-radius: 2px;
  box-shadow: none;
  font-size: 0;
}
.palette-vscode .xiangqi-piece.red {
  background: #ce9178;
}
.palette-vscode .xiangqi-piece.black {
  background: #569cd6;
}
.palette-vscode .river {
  color: transparent;
}
.palette-vscode .intersection.selected .xiangqi-piece {
  outline-width: 1px;
  outline-offset: 1px;
}
@keyframes check-pulse {
  to {
    transform: scale(0.88);
  }
}
</style>
