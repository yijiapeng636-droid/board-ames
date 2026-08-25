import type {
  Board,
  BonusMoves,
  GamePhase,
  GameResult,
  Move,
  Player,
} from '@/games/gomoku/types/gomoku'

export interface GameCheckpoint {
  board: Board
  moves: Move[]
  currentPlayer: Player
  bonusMoves: BonusMoves
  phase: GamePhase
  result: GameResult
  aiReason: string
  error: string
}

export function createCheckpoint(state: GameCheckpoint): GameCheckpoint {
  return {
    ...state,
    board: state.board.map((line) => [...line]),
    moves: state.moves.map((move) => ({ ...move })),
    bonusMoves: { ...state.bonusMoves },
  }
}
