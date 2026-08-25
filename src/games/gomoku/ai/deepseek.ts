import {
  BOARD_SIZE,
  type AIMove,
  type Board,
  type GameSnapshot,
  type Move,
  type PositionExperienceSummary,
  type Player,
  type SearchedCandidate,
} from '@/games/gomoku/types/gomoku'

const REQUEST_TIMEOUT_MS = 10_000

function snapshot(
  board: Board,
  moves: Move[],
  searchedCandidates: SearchedCandidate[],
  sessionExperience?: PositionExperienceSummary,
  humanPlayer: Player = 1,
): GameSnapshot {
  return {
    boardSize: BOARD_SIZE,
    humanPlayer: humanPlayer === 1 ? 'black' : 'white',
    aiPlayer: humanPlayer === 1 ? 'white' : 'black',
    board: board.map((line) =>
      line.map((piece) => (piece === 1 ? 'X' : piece === 2 ? 'O' : '.')).join(''),
    ),
    moves: moves.map((move) => ({ ...move })),
    searchedCandidates: searchedCandidates.map((candidate) => ({
      ...candidate,
      features: [...candidate.features],
      principalVariation: candidate.principalVariation.map((move) => ({ ...move })),
    })),
    ...(sessionExperience ? { sessionExperience } : {}),
  }
}

export async function requestAIMove(
  board: Board,
  moves: Move[],
  searchedCandidates: SearchedCandidate[],
  sessionExperience?: PositionExperienceSummary,
  retryReason?: string,
  signal?: AbortSignal,
  humanPlayer: Player = 1,
): Promise<AIMove> {
  const timeoutController = new AbortController()
  const timeout = window.setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS)
  const abort = () => timeoutController.abort()
  signal?.addEventListener('abort', abort, { once: true })

  try {
    const response = await fetch('/api/gomoku/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        game: snapshot(board, moves, searchedCandidates, sessionExperience, humanPlayer),
        retryReason,
      }),
      signal: timeoutController.signal,
    })

    const data: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      const message =
        data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
          ? (data as { error: string }).error
          : `AI 请求失败（HTTP ${response.status}）`
      throw new Error(message)
    }
    return data as AIMove
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(signal?.aborted ? 'AI 请求已取消' : 'AI 请求超时')
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}
