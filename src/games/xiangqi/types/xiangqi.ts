export const XIANGQI_ROWS = 10
export const XIANGQI_COLS = 9

export type XiangqiSide = 'red' | 'black'

export type XiangqiPieceType =
  'general' | 'advisor' | 'elephant' | 'horse' | 'rook' | 'cannon' | 'pawn'

export interface XiangqiPiece {
  id: string
  side: XiangqiSide
  type: XiangqiPieceType
}

export interface XiangqiPosition {
  row: number
  col: number
}

export interface XiangqiMove {
  turn: number
  side: XiangqiSide
  from: XiangqiPosition
  to: XiangqiPosition
  piece: XiangqiPiece
  captured: XiangqiPiece | null
  /** Bonus turns can keep the same side to move, so replay cannot infer this field. */
  nextSideToMove?: XiangqiSide
}

export type XiangqiMoveOption = Omit<XiangqiMove, 'turn' | 'nextSideToMove'>

export type XiangqiTerminalReason =
  | 'generalCaptured'
  | 'checkmate'
  | 'stalemate'
  | 'insufficientMaterial'
  | null

export interface XiangqiGameStatus {
  sideToMove: XiangqiSide
  inCheck: boolean
  legalMoves: XiangqiMoveOption[]
  result: XiangqiGameResult
  reason: XiangqiTerminalReason
}

export type XiangqiSquare = XiangqiPiece | null
export type XiangqiBoard = XiangqiSquare[][]
export type XiangqiGameResult = 'redWin' | 'blackWin' | 'draw' | null
export type XiangqiGamePhase = 'setup' | 'playing' | 'gameOver' | 'error'

export interface XiangqiReplayState {
  board: XiangqiBoard
  sideToMove: XiangqiSide
}

export type XiangqiMoveEffect = 'check' | 'kill' | 'capture' | 'exchange' | 'sacrifice' | 'block' | 'idle'
export type XiangqiPrimaryEffect = XiangqiMoveEffect

export interface XiangqiChaseEvidence {
  targetPieceId: string
  targetPieceType: XiangqiPieceType
  attackerPieceIds: string[]
  direct: boolean
  joint: boolean
  protected: boolean
  netGain: number
  immediateMateRisk: boolean
}

export interface XiangqiMoveClassification {
  side: XiangqiSide
  effects: XiangqiMoveEffect[]
  primaryEffect: XiangqiPrimaryEffect
  targetPieceIds: string[]
  ruleReference: string
  evidence: string[]
  chaseEvidence: XiangqiChaseEvidence[]
  forbidden: boolean
}

export interface XiangqiPositionHistoryEntry {
  key: string
  sideToMove: XiangqiSide
  move: XiangqiMove | null
  classification: XiangqiMoveClassification | null
}

export type XiangqiAdjudicationVerdict = 'none' | 'mustChange' | 'draw' | 'loss'

export interface XiangqiAdjudication {
  verdict: XiangqiAdjudicationVerdict
  responsibleSide: XiangqiSide | null
  reason: string
  ruleReference: string
  cycleStart: number | null
  cycleEnd: number | null
}
