<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import XiangqiBoard from '@/games/xiangqi/components/XiangqiBoard.vue'
import { requestXiangqiMove, requestXiangqiReview } from '@/games/xiangqi/ai/deepseek'
import { searchXiangqiInWorker } from '@/games/xiangqi/ai/searchClient'
import { analyzeXiangqiReviewInWorker } from '@/games/xiangqi/ai/reviewClient'
import { loadXiangqiSessionExperience, saveXiangqiSessionExperience } from '@/games/xiangqi/ai/sessionExperience'
import { cloneXiangqiBoard, createInitialXiangqiBoard, oppositeSide } from '@/games/xiangqi/core/board'
import { cloneXiangqiHistory, cloneXiangqiMove } from '@/games/xiangqi/core/history'
import {
  applyXiangqiMove,
  findGeneral,
  generateLegalMoves,
} from '@/games/xiangqi/core/legalMoves'
import { getXiangqiGameStatus } from '@/games/xiangqi/core/result'
import { adjudicateRepetition, createPositionKey } from '@/games/xiangqi/core/repetition'
import { formatXiangqiMove } from '@/games/xiangqi/core/notation'
import { classifyXiangqiMove } from '@/games/xiangqi/rules/classification'
import type {
  XiangqiAdjudication,
  XiangqiBoard as XiangqiBoardState,
  XiangqiMove,
  XiangqiPosition,
  XiangqiPositionHistoryEntry,
  XiangqiSide,
} from '@/games/xiangqi/types/xiangqi'

const emit = defineEmits<{ back: [] }>()
const board = ref(createInitialXiangqiBoard())
const selected = ref<XiangqiPosition | null>(null)
const legalTargets = ref<XiangqiPosition[]>([])
const sideToMove = ref<XiangqiSide>('red')
const moves = ref<XiangqiMove[]>([])
const started = ref(false)
const choosingSide = ref(false)
const humanSide = ref<XiangqiSide>('red')
const busy = ref(false)
const message = ref('点击“开始对局”选择执棋方。')
const hintMove = ref<Pick<XiangqiMove, 'from' | 'to'> | null>(null)
const review = ref<{ summary: string; suggestions: string[] } | null>(null)
const bonus = ref<Record<XiangqiSide, number>>({ red: 0, black: 0 })
const history = ref<XiangqiPositionHistoryEntry[]>([])
const adjudication = ref<XiangqiAdjudication | null>(null)
const mustChangeSide = ref<XiangqiSide | null>(null)
const checkpoints = ref<Array<{ board: XiangqiBoardState; moves: XiangqiMove[]; sideToMove: XiangqiSide; bonus: Record<XiangqiSide, number>; history: XiangqiPositionHistoryEntry[]; adjudication: XiangqiAdjudication | null; mustChangeSide: XiangqiSide | null }>>([])
let sessionId = 0
let moveController: AbortController | null = null
let hintController: AbortController | null = null
let reviewController: AbortController | null = null
const lastMove = computed(() => moves.value[moves.value.length - 1] ?? null)
const status = computed(() => getXiangqiGameStatus(board.value, sideToMove.value))
const effectiveResult = computed(() => adjudication.value?.verdict === 'loss' ? (adjudication.value.responsibleSide === 'red' ? 'blackWin' : 'redWin') : adjudication.value?.verdict === 'draw' ? 'draw' : status.value.result)
const checkedGeneral = computed(() =>
  status.value.inCheck ? findGeneral(board.value, sideToMove.value) : null,
)

function samePosition(left: XiangqiPosition, right: XiangqiPosition) {
  return left.row === right.row && left.col === right.col
}

function clearSelection() {
  selected.value = null
  legalTargets.value = []
}

function handleSelect(position: XiangqiPosition) {
  if (!started.value || busy.value || effectiveResult.value || sideToMove.value !== humanSide.value) return
  const piece = board.value[position.row]?.[position.col]
  if (piece?.side === sideToMove.value) {
    selected.value = { ...position }
    legalTargets.value = generateLegalMoves(board.value, sideToMove.value)
      .filter((move) => samePosition(move.from, position))
      .map((move) => move.to)
    return
  }
  if (!selected.value) return
  const legalMove = generateLegalMoves(board.value, sideToMove.value).find(
    (move) => samePosition(move.from, selected.value!) && samePosition(move.to, position),
  )
  if (!legalMove) {
    clearSelection()
    return
  }
  completeMove({ ...legalMove, turn: moves.value.length + 1 }, '玩家走子')
}

function abortTasks() {
  moveController?.abort()
  hintController?.abort()
  reviewController?.abort()
  moveController = null
  hintController = null
  reviewController = null
  sessionId += 1
  busy.value = false
}

function saveCheckpoint() {
  checkpoints.value.push({ board: cloneXiangqiBoard(board.value), moves: moves.value.map(cloneXiangqiMove), sideToMove: sideToMove.value, bonus: { ...bonus.value }, history: cloneXiangqiHistory(history.value), adjudication: adjudication.value ? { ...adjudication.value } : null, mustChangeSide: mustChangeSide.value })
}

function initializeHistory() {
  history.value = [{ key: createPositionKey(board.value, 'red'), sideToMove: 'red', move: null, classification: null }]
}

function startGame(aiSide: XiangqiSide) {
  resetGame()
  humanSide.value = oppositeSide(aiSide)
  started.value = true
  choosingSide.value = false
  message.value = `玩家执${humanSide.value === 'red' ? '红' : '黑'}，红方先行。`
  if (sideToMove.value === humanSide.value) saveCheckpoint()
  else void nextTick(runAI)
}

function resetGame() {
  abortTasks()
  started.value = false
  board.value = createInitialXiangqiBoard()
  sideToMove.value = 'red'
  moves.value = []
  bonus.value = { red: 0, black: 0 }
  adjudication.value = null
  mustChangeSide.value = null
  checkpoints.value = []
  hintMove.value = null
  review.value = null
  initializeHistory()
  clearSelection()
}

function finishExperience() {
  const experience = loadXiangqiSessionExperience()
  experience.games += 1
  if (effectiveResult.value === 'draw') experience.draws += 1
  else if (effectiveResult.value === `${humanSide.value}Win`) experience.wins += 1
  else experience.losses += 1
  saveXiangqiSessionExperience(experience)
}

function completeMove(move: XiangqiMove, reason: string) {
  const before = board.value
  const nextBoard = applyXiangqiMove(before, move)
  const normalNextSide = oppositeSide(move.side)
  const after = getXiangqiGameStatus(nextBoard, normalNextSide)
  let nextSide = normalNextSide
  if (!after.result && !after.inCheck && bonus.value[move.side] > 0) {
    bonus.value[move.side] -= 1
    nextSide = move.side
  } else if (after.inCheck) {
    bonus.value[move.side] = 0
  }
  const completedMove: XiangqiMove = { ...cloneXiangqiMove(move), nextSideToMove: nextSide }
  board.value = nextBoard
  moves.value.push(completedMove)
  const classification = classifyXiangqiMove(before, move)
  history.value.push({ key: createPositionKey(board.value, nextSide), sideToMove: nextSide, move: completedMove, classification })

  if (after.result) {
    sideToMove.value = nextSide
    message.value = reason
    finishExperience()
    return
  }

  const ruling = adjudicateRepetition(history.value, mustChangeSide.value)
  adjudication.value = ruling.verdict === 'none' ? null : ruling
  if (ruling.verdict === 'mustChange') mustChangeSide.value = ruling.responsibleSide
  else if (ruling.verdict === 'none' && mustChangeSide.value === move.side) mustChangeSide.value = null
  if (ruling.verdict === 'loss' || ruling.verdict === 'draw') {
    sideToMove.value = nextSide
    message.value = ruling.reason
    finishExperience()
    return
  }
  sideToMove.value = nextSide
  message.value = `${reason}；${classification.primaryEffect}`
  clearSelection(); hintMove.value = null
  if (sideToMove.value === humanSide.value) saveCheckpoint()
  else void nextTick(runAI)
}

async function runAI() {
  if (!started.value || effectiveResult.value || sideToMove.value === humanSide.value) return
  const currentSession = sessionId
  const taskController = new AbortController()
  moveController = taskController
  busy.value = true; message.value = 'AI 正在搜索…'
  try {
    const result = await searchXiangqiInWorker(board.value, sideToMove.value, { maxDepth: 3, timeBudgetMs: 900, positionHistory: history.value, mustChangeSide: mustChangeSide.value }, taskController.signal)
    if (currentSession !== sessionId || result.candidates.length === 0) return
    let chosen = result.candidates[0]!
    let reason = `本地搜索深度 ${result.depth}，${result.nodes} 节点`
    try {
      const selected = await requestXiangqiMove(board.value, moves.value, sideToMove.value, result.candidates.slice(0, 6), loadXiangqiSessionExperience(), taskController.signal)
      chosen = selected.move; reason = selected.reason
    } catch { reason += '；DeepSeek不可用，采用最高分合法候选' }
    if (currentSession === sessionId) completeMove({ ...chosen, turn: moves.value.length + 1 }, reason)
  } catch (error) { if (currentSession === sessionId && !(error instanceof DOMException && error.name === 'AbortError')) message.value = error instanceof Error ? error.message : 'AI搜索失败' }
  finally {
    if (currentSession === sessionId && moveController === taskController) {
      moveController = null
      busy.value = false
    }
  }
}

async function showHint() {
  if (!started.value || busy.value || effectiveResult.value || sideToMove.value !== humanSide.value) return
  const currentSession = sessionId
  const snapshot = createPositionKey(board.value, sideToMove.value)
  const taskController = new AbortController()
  hintController = taskController
  busy.value = true
  try {
    const result = await searchXiangqiInWorker(board.value, sideToMove.value, { maxDepth: 3, timeBudgetMs: 700, positionHistory: history.value, mustChangeSide: mustChangeSide.value }, taskController.signal)
    if (currentSession === sessionId && snapshot === createPositionKey(board.value, sideToMove.value) && result.candidates[0]) {
      hintMove.value = result.candidates[0]
      message.value = `提示：${formatXiangqiMove(result.candidates[0])}`
    }
  } catch (error) {
    if (currentSession === sessionId && !(error instanceof DOMException && error.name === 'AbortError')) message.value = error instanceof Error ? error.message : '提示搜索失败'
  } finally {
    if (currentSession === sessionId && hintController === taskController) {
      hintController = null
      busy.value = false
    }
  }
}

function undo() {
  if (checkpoints.value.length < 2) return
  abortTasks(); checkpoints.value.pop(); const point = checkpoints.value[checkpoints.value.length - 1]!
  board.value = cloneXiangqiBoard(point.board); moves.value = point.moves.map(cloneXiangqiMove); sideToMove.value = point.sideToMove; bonus.value = { ...point.bonus }; history.value = cloneXiangqiHistory(point.history); adjudication.value = point.adjudication ? { ...point.adjudication } : null; mustChangeSide.value = point.mustChangeSide; clearSelection(); hintMove.value = null; review.value = null; message.value = '已回到上一个稳定决策点。'
  if (sideToMove.value !== humanSide.value && !effectiveResult.value) void nextTick(runAI)
}

function grantBonus(side: XiangqiSide) { if (started.value && !effectiveResult.value && bonus.value[side] === 0) bonus.value[side] = 1 }

async function runReview() {
  if (!effectiveResult.value) return
  const currentSession = sessionId
  const taskController = new AbortController()
  reviewController = taskController
  busy.value = true
  try {
    const points = await analyzeXiangqiReviewInWorker(createInitialXiangqiBoard(), moves.value, humanSide.value, taskController.signal)
    const result = await requestXiangqiReview({ result: effectiveResult.value, moves: moves.value, points, adjudication: adjudication.value, localFactsOnly: true }, taskController.signal)
    if (currentSession === sessionId) review.value = result
  } catch (error) {
    if (currentSession === sessionId && !(error instanceof DOMException && error.name === 'AbortError')) review.value = { summary: 'AI复盘不可用，本地关键点仍然有效。', suggestions: ['复查被将军后的应将选择', '比较提示着法与实战着法'] }
  } finally {
    if (currentSession === sessionId && reviewController === taskController) {
      reviewController = null
      busy.value = false
    }
  }
}

initializeHistory()
onBeforeUnmount(abortTasks)
</script>

<template>
  <main class="xiangqi-game">
    <button type="button" class="back-button" @click="emit('back')">返回首页</button>
    <h1>中国象棋练习</h1>
    <p v-if="effectiveResult">
      <template v-if="effectiveResult === 'draw'">和棋：{{ adjudication?.reason ?? '双方均无取胜子力' }}</template>
      <template v-else>
        {{ effectiveResult === 'redWin' ? '红方胜' : '黑方胜' }}：{{ adjudication?.reason ?? (status.reason === 'checkmate' ? '将死' : '困毙') }}
      </template>
    </p>
    <p v-else-if="started">{{ sideToMove === 'red' ? '红方' : '黑方' }}行棋<span v-if="status.inCheck">，正在被将军</span></p>
    <p class="game-message">{{ message }}</p>
    <div class="game-actions">
      <button type="button" @click="choosingSide = true">开始对局</button>
      <button type="button" :disabled="!started" @click="resetGame(); choosingSide = true">重新开始</button>
      <button type="button" :disabled="checkpoints.length < 2 || busy" @click="undo">悔棋</button>
      <button type="button" :disabled="!started || busy || !!effectiveResult || sideToMove !== humanSide" @click="showHint">最佳提示</button>
      <button type="button" :disabled="!effectiveResult || busy" @click="runReview">赛后复盘</button>
    </div>
    <div class="bonus-actions">
      <button type="button" :disabled="!started || bonus[humanSide] > 0" @click="grantBonus(humanSide)">让玩家一步</button>
      <button type="button" :disabled="!started || bonus[humanSide === 'red' ? 'black' : 'red'] > 0" @click="grantBonus(humanSide === 'red' ? 'black' : 'red')">让 AI 一步</button>
    </div>
    <div class="board-scroll">
      <XiangqiBoard
        :board="board"
        :selected="selected"
        :legal-targets="legalTargets"
        :last-move="lastMove"
        :hint-move="hintMove"
        :checked-general="checkedGeneral"
        @select="handleSelect"
      />
    </div>
    <section v-if="review" class="review-panel"><h2>赛后 AI 复盘</h2><p>{{ review.summary }}</p><ul><li v-for="item in review.suggestions" :key="item">{{ item }}</li></ul></section>
    <div v-if="choosingSide" class="modal-backdrop" role="presentation">
      <section class="side-dialog" role="dialog" aria-modal="true" aria-labelledby="xiangqi-side-title">
        <h2 id="xiangqi-side-title">选择 AI 执棋方</h2>
        <p>红方始终先行。</p>
        <button type="button" @click="startGame('red')">AI 用红棋先手</button>
        <button type="button" @click="startGame('black')">AI 用黑棋后手</button>
        <button type="button" @click="choosingSide = false">取消</button>
      </section>
    </div>
  </main>
</template>

<style scoped>
.xiangqi-game {
  width: min(100% - 2rem, 760px);
  margin: 0 auto;
  padding: 2rem 0;
}
.xiangqi-game h1 {
  margin-bottom: 0.4rem;
}
.back-button {
  padding: 0.5rem 0.8rem;
  border: 1px solid #76501f;
  border-radius: 6px;
  background: #fffaf0;
  cursor: pointer;
}
.game-actions,
.bonus-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0.75rem 0;
}
.game-actions button,
.bonus-actions button,
.side-dialog button {
  padding: 0.5rem 0.8rem;
}
.modal-backdrop {
  position: fixed;
  z-index: 20;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgb(0 0 0 / 55%);
}
.side-dialog {
  display: grid;
  gap: 0.75rem;
  width: min(90vw, 360px);
  padding: 1.5rem;
  border-radius: 12px;
  background: #fffaf0;
  color: #24180d;
}
.review-panel {
  margin-top: 1rem;
  padding: 1rem;
  border: 1px solid #76501f;
  border-radius: 8px;
}
.board-scroll {
  overflow-x: auto;
  margin-top: 1rem;
  padding-bottom: 0.75rem;
}
</style>
