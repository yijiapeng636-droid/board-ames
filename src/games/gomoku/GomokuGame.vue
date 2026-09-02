<script setup lang="ts">
import { ref } from 'vue'
import GameReviewPanel from '@/games/gomoku/components/GameReviewPanel.vue'
import GameStatus from '@/games/gomoku/components/GameStatus.vue'
import GomokuBoard from '@/games/gomoku/components/GomokuBoard.vue'
import { useGomokuGameSession } from '@/games/gomoku/useGomokuGameSession'

const emit = defineEmits<{ back: [] }>()
const backgroundTheme = ref<'light' | 'vscode'>('light')
const boardDisplaySize = ref<'small' | 'medium' | 'large'>('medium')
const boardPalette = ref<'wood' | 'slate' | 'vscode'>('wood')
const {
  board,
  started,
  showSetup,
  humanPlayer,
  aiPlayer,
  bonusMoves,
  phase,
  result,
  aiReason,
  errorMessage,
  experienceMessage,
  hint,
  reviewPhase,
  reviewPoints,
  gameReview,
  reviewError,
  checkpoints,
  gameSessionId,
  isDevelopment,
  returnHome,
  handlePlayerMove,
  retryAI,
  showHint,
  undo,
  giveBonus,
  restart,
  clearExperience,
  copyAITrace,
  startGame,
  requestReviewSummary,
} = useGomokuGameSession(() => emit('back'))

function applyVisualPreset(preset: 'classic' | 'slate' | 'vscode') {
  if (preset === 'classic') {
    backgroundTheme.value = 'light'
    boardPalette.value = 'wood'
  } else if (preset === 'slate') {
    backgroundTheme.value = 'vscode'
    boardPalette.value = 'slate'
  } else {
    backgroundTheme.value = 'vscode'
    boardPalette.value = 'vscode'
  }
}
</script>

<template>
  <div
    class="app-page"
    :data-theme="backgroundTheme"
    :data-stealth="backgroundTheme === 'vscode' && boardPalette === 'vscode'"
  >
    <main>
      <button type="button" class="back-home" @click="returnHome">返回首页</button>
      <h1>
        {{ backgroundTheme === 'vscode' && boardPalette === 'vscode' ? 'board.ts' : 'AI 五子棋' }}
      </h1>
      <p class="players">
        你：{{ humanPlayer === 1 ? '黑棋' : '白棋' }}　AI：{{ aiPlayer === 1 ? '黑棋' : '白棋' }}
      </p>
      <GameStatus
        :phase="phase"
        :result="result"
        :reason="aiReason"
        :error="errorMessage"
        :human-player="humanPlayer"
        :started="started"
      />
      <div class="board-scroll">
        <div class="board-shell">
          <GomokuBoard
            :board="board"
            :disabled="!started || phase !== 'playerTurn'"
            :hint-move="hint.move"
            :display-size="boardDisplaySize"
            :palette="boardPalette"
            @place="handlePlayerMove"
          />
          <button v-if="!started" type="button" class="start-on-board" @click="showSetup = true">
            开始对局
          </button>
        </div>
      </div>
      <div class="actions">
        <button v-if="phase === 'aiError'" type="button" @click="retryAI">重新请求 AI</button>
        <button
          type="button"
          :disabled="phase !== 'playerTurn' || hint.phase === 'analyzing'"
          @click="showHint"
        >
          {{ hint.phase === 'analyzing' ? '正在计算提示…' : '最佳提示' }}
        </button>
        <button type="button" :disabled="checkpoints.length === 0" @click="undo">悔棋</button>
        <details>
          <summary>让一步</summary>
          <div class="bonus-actions">
            <button
              type="button"
              :disabled="!started || phase !== 'playerTurn' || bonusMoves.human > 0"
              @click="giveBonus(humanPlayer)"
            >
              AI 让我一步
            </button>
            <button
              type="button"
              :disabled="!started || phase !== 'playerTurn' || bonusMoves.ai > 0"
              @click="giveBonus(aiPlayer)"
            >
              让 AI 一步
            </button>
          </div>
        </details>
        <details>
          <summary>背景组合</summary>
          <div class="setting-menu">
            <button
              type="button"
              :aria-pressed="backgroundTheme === 'light' && boardPalette === 'wood'"
              @click="applyVisualPreset('classic')"
            >
              经典米白 + 木棋盘
            </button>
            <button
              type="button"
              :aria-pressed="backgroundTheme === 'vscode' && boardPalette === 'slate'"
              @click="applyVisualPreset('slate')"
            >
              深色 + 石板棋盘
            </button>
            <button
              type="button"
              :aria-pressed="backgroundTheme === 'vscode' && boardPalette === 'vscode'"
              @click="applyVisualPreset('vscode')"
            >
              VS Code 隐身组合
            </button>
          </div>
        </details>
        <details>
          <summary>棋盘颜色</summary>
          <div class="setting-menu">
            <button
              type="button"
              :aria-pressed="boardPalette === 'wood'"
              @click="boardPalette = 'wood'"
            >
              经典木色
            </button>
            <button
              type="button"
              :aria-pressed="boardPalette === 'slate'"
              @click="boardPalette = 'slate'"
            >
              深色石板
            </button>
            <button
              type="button"
              :aria-pressed="boardPalette === 'vscode'"
              @click="boardPalette = 'vscode'"
            >
              VS Code 编辑器色
            </button>
          </div>
        </details>
        <details>
          <summary>棋盘大小</summary>
          <div class="setting-menu size-menu">
            <button
              v-for="option in [
                { value: 'small', label: '小' },
                { value: 'medium', label: '中' },
                { value: 'large', label: '大' },
              ] as const"
              :key="option.value"
              type="button"
              :aria-pressed="boardDisplaySize === option.value"
              @click="boardDisplaySize = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </details>
        <button type="button" @click="restart">重新开始</button>
        <button type="button" @click="showSetup = true">选择先后手</button>
        <button type="button" @click="clearExperience">清空本次会话经验</button>
        <button v-if="isDevelopment" type="button" @click="copyAITrace">复制本局 AI Trace</button>
      </div>
      <p v-if="hint.reason" class="hint-message" aria-live="polite">{{ hint.reason }}</p>
      <p v-if="experienceMessage" class="experience-message" aria-live="polite">
        {{ experienceMessage }}
      </p>
      <GameReviewPanel
        :phase="reviewPhase"
        :points="reviewPoints"
        :review="gameReview"
        :error="reviewError"
        @retry="requestReviewSummary(gameSessionId)"
      />
      <div
        v-if="showSetup"
        class="modal-backdrop"
        role="presentation"
        @click.self="showSetup = false"
      >
        <section class="setup-modal" role="dialog" aria-modal="true" aria-labelledby="setup-title">
          <h2 id="setup-title">选择 AI 的先后手</h2>
          <p>黑棋先手。你可以让 AI 执黑先下，或让 AI 执白后下。</p>
          <div class="setup-actions">
            <button type="button" @click="startGame(1)">AI 用黑棋先手</button>
            <button type="button" @click="startGame(2)">AI 用白棋后手</button>
            <button type="button" @click="showSetup = false">取消</button>
          </div>
        </section>
      </div>
    </main>
  </div>
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
  transition:
    color 160ms ease,
    background 160ms ease;
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
.app-page[data-stealth='true'] main {
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
.app-page[data-stealth='true'] .players,
.app-page[data-stealth='true'] :deep(.status) {
  color: #858585;
  font-size: 0.78rem;
}
.app-page[data-stealth='true'] .actions {
  font-size: 0.75rem;
}
main {
  width: min(100% - 2rem, 760px);
  margin: 0 auto;
  padding: 2rem 0;
}
.back-home {
  margin-bottom: 0.75rem;
  padding: 0.4rem 0.7rem;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  color: var(--page-text);
  background: var(--control-bg);
  cursor: pointer;
}
h1 {
  margin: 0;
}
.players {
  margin: 0.5rem 0 0;
}
.board-scroll {
  overflow-x: auto;
  padding-bottom: 0.5rem;
}
.board-shell {
  position: relative;
  width: fit-content;
}
.start-on-board {
  position: absolute;
  z-index: 4;
  top: 50%;
  left: 50%;
  padding: 0.8rem 1.25rem;
  border: 2px solid #5f3d16;
  border-radius: 999px;
  color: #fff;
  background: #7b4e1c;
  box-shadow: 0 5px 18px rgb(0 0 0 / 28%);
  transform: translate(-50%, -50%);
  cursor: pointer;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0.75rem;
  margin-top: 1rem;
}
.actions button,
summary {
  padding: 0.55rem 0.9rem;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  color: var(--page-text);
  background: var(--control-bg);
  cursor: pointer;
}
.actions button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
summary {
  list-style: none;
}
.bonus-actions {
  position: absolute;
  z-index: 5;
  display: grid;
  gap: 0.4rem;
  margin-top: 0.35rem;
  padding: 0.5rem;
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  background: var(--panel-bg);
  box-shadow: 0 4px 14px rgb(40 28 14 / 18%);
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
.hint-message {
  color: #8b1d16;
  font-weight: 600;
}
.experience-message {
  color: #52606d;
}
.modal-backdrop {
  position: fixed;
  z-index: 20;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgb(20 15 10 / 55%);
}
.setup-modal {
  width: min(100%, 430px);
  padding: 1.25rem;
  border-radius: 12px;
  color: var(--page-text);
  background: var(--panel-bg);
  box-shadow: 0 16px 45px rgb(0 0 0 / 32%);
}
.setup-modal h2 {
  margin-top: 0;
}
.setup-actions {
  display: grid;
  gap: 0.65rem;
}
.setup-actions button {
  padding: 0.7rem;
}
</style>
