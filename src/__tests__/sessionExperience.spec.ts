import { beforeEach, describe, expect, it } from 'vitest'
import {
  SESSION_EXPERIENCE_KEY,
  clearSessionExperience,
  createPositionKey,
  discardUnfinishedGame,
  finishSessionGame,
  getPositionExperience,
  getSessionGames,
  recordAIDecision,
  reloadSessionExperience,
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
    reloadSessionExperience()

    expect(getSessionGames()[0]).toMatchObject({ id: gameId, result: 'whiteWin' })
    expect(getPositionExperience(key)).toEqual({
      seen: 1,
      moves: [{ row: 7, col: 8, played: 1, finalResults: { win: 1, loss: 0, draw: 0 } }],
    })
  })

  it('trims old games and discards only the selected unfinished game', () => {
    const ids = Array.from({ length: SEARCH_CONFIG.sessionGameLimit + 2 }, () => startSessionGame())
    expect(getSessionGames()).toHaveLength(SEARCH_CONFIG.sessionGameLimit)
    const latest = ids[ids.length - 1]!
    discardUnfinishedGame(latest)
    expect(getSessionGames().some((game) => game.id === latest)).toBe(false)
  })

  it('clears memory and sessionStorage', () => {
    startSessionGame()
    clearSessionExperience()
    expect(getSessionGames()).toEqual([])
    expect(sessionStorage.getItem(SESSION_EXPERIENCE_KEY)).toBeNull()
  })

  it('recovers safely from corrupted sessionStorage data', () => {
    sessionStorage.setItem(SESSION_EXPERIENCE_KEY, '{not-json')
    expect(() => reloadSessionExperience()).not.toThrow()
    expect(getSessionGames()).toEqual([])
    expect(sessionStorage.getItem(SESSION_EXPERIENCE_KEY)).toBeNull()
  })
})
