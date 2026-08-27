import type {
  XiangqiAdjudicationVerdict,
  XiangqiMoveEffect,
  XiangqiPieceType,
  XiangqiPosition,
  XiangqiSide,
} from '@/games/xiangqi/types/xiangqi'

export interface OfficialPositionPiece {
  id: string
  side: XiangqiSide
  type: XiangqiPieceType
  position: XiangqiPosition
}

export interface OfficialChaseExpectation {
  targetPieceType?: XiangqiPieceType
  direct?: boolean
  joint?: boolean
  protected?: boolean
}

export interface OfficialClassificationExpectation {
  primaryEffect: XiangqiMoveEffect
  effects?: XiangqiMoveEffect[]
  forbidden?: boolean
  chase?: OfficialChaseExpectation
}

export interface OfficialCaseMove {
  from: XiangqiPosition
  to: XiangqiPosition
  notation: string
  expected: OfficialClassificationExpectation
}

export type OfficialAdjudicationStep =
  | { status: 'draw' }
  | { status: 'mustChange'; mustChangeSide: XiangqiSide }
  | { status: 'loss'; losingSide: XiangqiSide }

export interface OfficialCaseAdjudication {
  atRepetition: OfficialAdjudicationStep
  onContinuation?: Extract<OfficialAdjudicationStep, { status: 'loss' }>
}

export interface OfficialXiangqiCase {
  id: string
  chapter: 8 | 9
  figure: number
  title: string
  sourceUrl: string
  ruleRefs: string[]
  coverageIds: string[]
  sideToMove: XiangqiSide
  initialPosition: OfficialPositionPiece[]
  cycleMoves: OfficialCaseMove[]
  expectedAdjudication: OfficialCaseAdjudication
}

export interface OfficialMoveResult {
  cycle: number
  moveIndex: number
  notation: string
  actualClassification: XiangqiMoveEffect
}

export interface OfficialAdjudicationResult {
  status: XiangqiAdjudicationVerdict
  responsibleSide: XiangqiSide | null
}

export interface OfficialCaseResult {
  caseId: string
  passed: true
  moves: OfficialMoveResult[]
  adjudication: OfficialAdjudicationResult
  continuedAdjudication: OfficialAdjudicationResult | null
}
