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
  XiangqiMoveEffect,
  XiangqiPosition,
  XiangqiPositionHistoryEntry,
  XiangqiSide,
} from '@/games/xiangqi/types/xiangqi'

const effectLabels: Record<XiangqiMoveEffect, string> = {
  check: '将',
  kill: '杀',
  capture: '捉',
  exchange: '兑',
  sacrifice: '献',
  block: '拦',
  idle: '闲',
}

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
const backgroundTheme = ref<'light' | 'vscode'>('light')
const boardDisplaySize = ref<'small' | 'medium' | 'large'>('medium')
const boardPalette = ref<'wood' | 'slate' | 'vscode'>('wood')
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
  const displayReason = reason.replace(/[。；，、.!?！？;]+$/u, '')
  message.value = `${displayReason}；棋例分类：${effectLabels[classification.primaryEffect]}`
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

function applyVisualPreset(preset: 'classic' | 'slate' | 'vscode') {
  backgroundTheme.value = preset === 'classic' ? 'light' : 'vscode'
  boardPalette.value = preset === 'classic' ? 'wood' : preset
}

initializeHistory()
onBeforeUnmount(abortTasks)
</script>

<template>
  <div
    class="app-page"
    :data-theme="backgroundTheme"
    :data-stealth="backgroundTheme === 'vscode' && boardPalette === 'vscode'"
  >
  <main class="xiangqi-game">
    <button type="button" class="back-button" @click="emit('back')">返回首页</button>
    <h1>{{ backgroundTheme === 'vscode' && boardPalette === 'vscode' ? 'xiangqi.ts' : '中国象棋练习' }}</h1>
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
      <details>
        <summary>背景组合</summary>
        <div class="setting-menu">
          <button type="button" :aria-pressed="backgroundTheme === 'light' && boardPalette === 'wood'" @click="applyVisualPreset('classic')">经典米白 + 木棋盘</button>
          <button type="button" :aria-pressed="backgroundTheme === 'vscode' && boardPalette === 'slate'" @click="applyVisualPreset('slate')">深色 + 石板棋盘</button>
          <button type="button" :aria-pressed="backgroundTheme === 'vscode' && boardPalette === 'vscode'" @click="applyVisualPreset('vscode')">VS Code 隐身组合</button>
        </div>
      </details>
      <details>
        <summary>棋盘颜色</summary>
        <div class="setting-menu">
          <button type="button" :aria-pressed="boardPalette === 'wood'" @click="boardPalette = 'wood'">经典木色</button>
          <button type="button" :aria-pressed="boardPalette === 'slate'" @click="boardPalette = 'slate'">深色石板</button>
          <button type="button" :aria-pressed="boardPalette === 'vscode'" @click="boardPalette = 'vscode'">VS Code 编辑器色</button>
        </div>
      </details>
      <details>
        <summary>棋盘大小</summary>
        <div class="setting-menu size-menu">
          <button v-for="option in [{ value: 'small', label: '小' }, { value: 'medium', label: '中' }, { value: 'large', label: '大' }] as const" :key="option.value" type="button" :aria-pressed="boardDisplaySize === option.value" @click="boardDisplaySize = option.value">{{ option.label }}</button>
        </div>
      </details>
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
        :display-size="boardDisplaySize"
        :palette="boardPalette"
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
  </div>
</template>

<style scoped>
.app-page {
  --page-bg: #f5f1e8;
  --page-text: #241b11;
  --control-bg: #fffaf0;
  --control-border: #76501f;
  --panel-bg: #fffaf0;
  --panel-border: #c8ae86;
  min-height: 100vh;
  color: var(--page-text);
  background: var(--page-bg);
}
.app-page[data-theme='vscode'] {
  --page-bg: #1e1e1e;
  --page-text: #d4d4d4;
  --control-bg: #2d2d30;
  --control-border: #6a6a6a;
  --panel-bg: #252526;
  --panel-border: #454545;
}
.app-page[data-stealth='true'] {
  background: linear-gradient(90deg, #181818 0 46px, transparent 46px), var(--page-bg);
}
.app-page[data-stealth='true'] .xiangqi-game {
  font-family: Consolas, 'Courier New', monospace;
}
.app-page[data-stealth='true'] h1 {
  width: fit-content;
  padding: 0.45rem 1.5rem;
  border-top: 1px solid #007acc;
  color: #cccccc;
  background: #1e1e1e;
  font-size: 0.9rem;
  font-weight: 400;
}
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
  border: 1px solid var(--control-border);
  border-radius: 6px;
  color: var(--page-text);
  background: var(--control-bg);
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
.side-dialog button,
summary {
  padding: 0.5rem 0.8rem;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  color: var(--page-text);
  background: var(--control-bg);
  cursor: pointer;
}
summary {
  list-style: none;
}
.setting-menu {
  position: absolute;
  z-index: 6;
  display: grid;
  gap: 0.4rem;
  margin-top: 0.35rem;
  padding: 0.5rem;
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  background: var(--panel-bg);
  box-shadow: 0 4px 14px rgb(0 0 0 / 22%);
}
.size-menu {
  grid-template-columns: repeat(3, minmax(2.5rem, 1fr));
}
.setting-menu button[aria-pressed='true'] {
  border-color: #3794ff;
  outline: 2px solid #3794ff;
  outline-offset: -2px;
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
  color: var(--page-text);
  background: var(--panel-bg);
}
.review-panel {
  margin-top: 1rem;
  padding: 1rem;
  border: 1px solid var(--control-border);
  border-radius: 8px;
}
.board-scroll {
  overflow-x: auto;
  margin-top: 1rem;
  padding-bottom: 0.75rem;
}
</style>
