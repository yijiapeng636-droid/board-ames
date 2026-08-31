import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearSessionExperience,
  createPositionKey,
  discardUnfinishedGame,
  finishSessionGame,
  getPositionExperience,
  getSessionGames,
  recordAIDecision,
  startSessionGame,
} from '@/games/gomoku/ai/sessionExperience'
import { SEARCH_CONFIG } from '@/games/gomoku/ai/searchConfig'
import { createBoard } from '@/games/gomoku/core/game'

beforeEach(() => clearSessionExperience())

describe('session experience', () => {
  it('records, loads, finishes, and looks up the same position', () => {
    const board = createBoard()
    board[7]![7] = 1
    const key = createPositionKey(board, 2)
    const gameId = startSessionGame()
    recordAIDecision(
      gameId,
      {
        positionKey: key,
        selectedMove: { row: 7, col: 8 },
        searchScore: 500,
        localBestMove: { row: 7, col: 8 },
        localBestScore: 500,
        source: 'deepseek',
      },
      [],
    )
    finishSessionGame(gameId, 'whiteWin', [])
    expect(getSessionGames()[0]).toMatchObject({ id: gameId, result: 'whiteWin' })
    expect(getPositionExperience(key)).toEqual({
      seen: 1,
      moves: [{ row: 7, col: 8, played: 1, finalResults: { win: 1, loss: 0, draw: 0 } }],
    })
  })

  it('keeps every game and marks an unfinished game as interrupted', () => {
    const before = getSessionGames().length
    const ids = Array.from({ length: SEARCH_CONFIG.sessionGameLimit + 2 }, () => startSessionGame())
    expect(getSessionGames()).toHaveLength(before + SEARCH_CONFIG.sessionGameLimit + 2)
    const latest = ids[ids.length - 1]!
    discardUnfinishedGame(latest)
    expect(getSessionGames().find((game) => game.id === latest)).toMatchObject({
      status: 'interrupted',
      interruptionReason: 'restart',
    })
  })

  it('clears derived session experience without deleting audit history', () => {
    const board = createBoard()
    board[1]![1] = 1
    const key = createPositionKey(board, 2)
    const gameId = startSessionGame()
    recordAIDecision(
      gameId,
      {
        positionKey: key,
        selectedMove: { row: 1, col: 2 },
        source: 'deepseek',
      },
      [],
    )
    finishSessionGame(gameId, 'whiteWin', [])
    const before = getSessionGames().length
    expect(getPositionExperience(key)?.seen).toBe(1)

    clearSessionExperience()
    expect(getSessionGames()).toHaveLength(before)
    expect(getPositionExperience(key)).toBeUndefined()
  })
})
