import { oppositeSide } from '@/games/xiangqi/core/board'
import { applyXiangqiMove, generateLegalMoves } from '@/games/xiangqi/core/legalMoves'
import { formatXiangqiMove } from '@/games/xiangqi/core/notation'
import { adjudicateRepetition, createPositionKey } from '@/games/xiangqi/core/repetition'
import { classifyXiangqiMove } from '@/games/xiangqi/rules/classification'
import type { RuleCoverageEntry } from '@/games/xiangqi/rules/sources'
import {
  XIANGQI_COLS,
  XIANGQI_ROWS,
  type XiangqiAdjudication,
  type XiangqiBoard,
  type XiangqiMove,
  type XiangqiMoveClassification,
  type XiangqiMoveOption,
  type XiangqiPieceType,
  type XiangqiPositionHistoryEntry,
  type XiangqiSide,
} from '@/games/xiangqi/types/xiangqi'
import type {
  OfficialAdjudicationStep,
  OfficialCaseResult,
  OfficialClassificationExpectation,
  OfficialMoveResult,
  OfficialXiangqiCase,
} from '@/games/xiangqi/tests/official-cases/types'

const VALID_SIDES = new Set<XiangqiSide>(['red', 'black'])
const VALID_PIECE_TYPES = new Set<XiangqiPieceType>([
  'general', 'advisor', 'elephant', 'horse', 'rook', 'cannon', 'pawn',
])

function fail(officialCase: OfficialXiangqiCase, message: string): never {
  throw new Error(`${officialCase.id}: ${message}`)
}

export function buildOfficialPosition(officialCase: OfficialXiangqiCase): XiangqiBoard {
  if (!VALID_SIDES.has(officialCase.sideToMove)) fail(officialCase, `sideToMove 非法：${String(officialCase.sideToMove)}`)
  const board: XiangqiBoard = Array.from({ length: XIANGQI_ROWS }, () => Array(XIANGQI_COLS).fill(null))
  const pieceIds = new Set<string>()
  const generals: Record<XiangqiSide, number> = { red: 0, black: 0 }

  for (const item of officialCase.initialPosition) {
    const { row, col } = item.position
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= XIANGQI_ROWS || col < 0 || col >= XIANGQI_COLS) {
      fail(officialCase, `棋子 ${item.id} 坐标越界：(${row}, ${col})`)
    }
    if (!item.id.trim()) fail(officialCase, '棋子 id 不能为空')
    if (pieceIds.has(item.id)) fail(officialCase, `棋子 id 重复：${item.id}`)
    if (!VALID_SIDES.has(item.side)) fail(officialCase, `棋子 ${item.id} 阵营非法：${String(item.side)}`)
    if (!VALID_PIECE_TYPES.has(item.type)) fail(officialCase, `棋子 ${item.id} 类型非法：${String(item.type)}`)
    if (board[row]![col]) fail(officialCase, `初始局面坐标重复：(${row}, ${col})`)
    pieceIds.add(item.id)
    if (item.type === 'general') generals[item.side] += 1
    board[row]![col] = { id: item.id, side: item.side, type: item.type }
  }

  if (generals.red !== 1 || generals.black !== 1) {
    fail(officialCase, `初始局面必须且只能各有一个帅/将，当前 red=${generals.red}, black=${generals.black}`)
  }
  return board
}

function samePosition(left: { row: number; col: number }, right: { row: number; col: number }) {
  return left.row === right.row && left.col === right.col
}

function resolveOfficialMove(
  officialCase: OfficialXiangqiCase,
  board: XiangqiBoard,
  sideToMove: XiangqiSide,
  moveIndex: number,
): XiangqiMoveOption {
  const expected = officialCase.cycleMoves[moveIndex]!
  const legalMove = generateLegalMoves(board, sideToMove).find((candidate) =>
    samePosition(candidate.from, expected.from) && samePosition(candidate.to, expected.to),
  )
  if (!legalMove) fail(officialCase, `${expected.notation}: 官方着法不在 Legal Moves 中`)

  const actualNotation = formatXiangqiMove(legalMove)
  if (actualNotation !== expected.notation) {
    fail(officialCase, `着法记谱与坐标不一致：声明 ${expected.notation}，坐标生成 ${actualNotation}`)
  }
  return legalMove
}

function sameEffectSet(actual: string[], expected: string[]) {
  const left = [...new Set(actual)].sort()
  const right = [...new Set(expected)].sort()
  return left.length === right.length && left.every((item, index) => item === right[index])
}

function assertClassification(
  officialCase: OfficialXiangqiCase,
  notation: string,
  expected: OfficialClassificationExpectation,
  actual: XiangqiMoveClassification,
) {
  if (actual.primaryEffect !== expected.primaryEffect) {
    fail(officialCase, `${notation}: 预期主分类 ${expected.primaryEffect}，实际 ${actual.primaryEffect}；${actual.evidence.join('；')}`)
  }
  if (expected.effects && !sameEffectSet(actual.effects, expected.effects)) {
    fail(officialCase, `${notation}: 预期作用 [${expected.effects.join(', ')}]，实际 [${actual.effects.join(', ')}]`)
  }
  if (expected.forbidden !== undefined && actual.forbidden !== expected.forbidden) {
    fail(officialCase, `${notation}: 预期 forbidden=${expected.forbidden}，实际 ${actual.forbidden}`)
  }
  if (expected.chase) {
    const matched = actual.chaseEvidence.some((evidence) =>
      (expected.chase?.targetPieceType === undefined || evidence.targetPieceType === expected.chase.targetPieceType)
      && (expected.chase?.direct === undefined || evidence.direct === expected.chase.direct)
      && (expected.chase?.joint === undefined || evidence.joint === expected.chase.joint)
      && (expected.chase?.protected === undefined || evidence.protected === expected.chase.protected),
    )
    if (!matched) {
      fail(officialCase, `${notation}: 未找到符合 Fixture 规则语义的捉子证据；实际 ${JSON.stringify(actual.chaseEvidence)}`)
    }
  }
}

export function validateOfficialCase(officialCase: OfficialXiangqiCase): true {
  if (officialCase.cycleMoves.length === 0) fail(officialCase, 'cycleMoves 不能为空')
  let board = buildOfficialPosition(officialCase)
  let sideToMove = officialCase.sideToMove
  const initialKey = createPositionKey(board, sideToMove)

  for (let moveIndex = 0; moveIndex < officialCase.cycleMoves.length; moveIndex += 1) {
    const legalMove = resolveOfficialMove(officialCase, board, sideToMove, moveIndex)
    board = applyXiangqiMove(board, legalMove)
    sideToMove = oppositeSide(sideToMove)
  }

  const finalKey = createPositionKey(board, sideToMove)
  if (finalKey !== initialKey) fail(officialCase, '执行一个 cycle 后未回到相同 Position Key，不是有效的重复循环 Fixture')
  return true
}

function executeCycle(
  officialCase: OfficialXiangqiCase,
  state: { board: XiangqiBoard; sideToMove: XiangqiSide; history: XiangqiPositionHistoryEntry[]; turn: number },
  cycle: number,
  results: OfficialMoveResult[],
  mustChangeSide: XiangqiSide | null,
) {
  let ruling = adjudicateRepetition(state.history, mustChangeSide)
  for (let moveIndex = 0; moveIndex < officialCase.cycleMoves.length; moveIndex += 1) {
    const expected = officialCase.cycleMoves[moveIndex]!
    const legalMove = resolveOfficialMove(officialCase, state.board, state.sideToMove, moveIndex)
    const nextSide = oppositeSide(state.sideToMove)
    const move: XiangqiMove = { ...legalMove, turn: ++state.turn, nextSideToMove: nextSide }
    const classification = classifyXiangqiMove(state.board, move)
    results.push({ cycle, moveIndex, notation: expected.notation, actualClassification: classification.primaryEffect })
    assertClassification(officialCase, expected.notation, expected.expected, classification)
    state.board = applyXiangqiMove(state.board, move)
    state.sideToMove = nextSide
    state.history.push({ key: createPositionKey(state.board, nextSide), sideToMove: nextSide, move, classification })
    ruling = adjudicateRepetition(state.history, mustChangeSide)
  }
  return ruling
}

function expectedResponsibleSide(expectation: OfficialAdjudicationStep): XiangqiSide | null {
  if (expectation.status === 'loss') return expectation.losingSide ?? null
  if (expectation.status === 'mustChange') return expectation.mustChangeSide ?? null
  return null
}

function assertAdjudication(
  officialCase: OfficialXiangqiCase,
  stage: string,
  expectation: OfficialAdjudicationStep,
  actual: XiangqiAdjudication,
) {
  const expectedSide = expectedResponsibleSide(expectation)
  if (actual.verdict !== expectation.status || actual.responsibleSide !== expectedSide) {
    fail(officialCase, `${stage}预期裁决 ${expectation.status}/${expectedSide ?? '-'}，实际 ${actual.verdict}/${actual.responsibleSide ?? '-'}`)
  }
}

export function runOfficialCase(officialCase: OfficialXiangqiCase): OfficialCaseResult {
  validateOfficialCase(officialCase)
  const board = buildOfficialPosition(officialCase)
  const history: XiangqiPositionHistoryEntry[] = [
    { key: createPositionKey(board, officialCase.sideToMove), sideToMove: officialCase.sideToMove, move: null, classification: null },
  ]
  const state = { board, sideToMove: officialCase.sideToMove, history, turn: 0 }
  const moves: OfficialMoveResult[] = []
  let ruling = adjudicateRepetition(state.history)
  for (let cycle = 1; cycle <= 3 && ruling.verdict === 'none'; cycle += 1) {
    ruling = executeCycle(officialCase, state, cycle, moves, null)
  }
  assertAdjudication(officialCase, '第三次重复时', officialCase.expectedAdjudication.atRepetition, ruling)

  let continuedAdjudication: OfficialCaseResult['continuedAdjudication'] = null
  const continuation = officialCase.expectedAdjudication.onContinuation
  if (continuation) {
    let continued = ruling
    const atRepetition = officialCase.expectedAdjudication.atRepetition
    const mustChangeSide = atRepetition.status === 'mustChange' ? atRepetition.mustChangeSide : null
    for (let cycle = 4; cycle <= 6 && continued.verdict !== 'loss'; cycle += 1) {
      continued = executeCycle(officialCase, state, cycle, moves, mustChangeSide)
    }
    assertAdjudication(officialCase, '继续原循环后', continuation, continued)
    continuedAdjudication = { status: continued.verdict, responsibleSide: continued.responsibleSide }
  }
  return {
    caseId: officialCase.id,
    passed: true,
    moves,
    adjudication: { status: ruling.verdict, responsibleSide: ruling.responsibleSide },
    continuedAdjudication,
  }
}

export function assertOfficialCoverageIntegrity(
  coverage: RuleCoverageEntry[],
  cases: OfficialXiangqiCase[],
): true {
  const coverageById = new Map<string, RuleCoverageEntry>()
  for (const entry of coverage) {
    if (coverageById.has(entry.id)) throw new Error(`Coverage id 重复：${entry.id}`)
    if (new Set(entry.requiredCaseIds).size !== entry.requiredCaseIds.length) {
      throw new Error(`${entry.id}: requiredCaseIds 存在重复值`)
    }
    coverageById.set(entry.id, entry)
  }

  const caseById = new Map<string, OfficialXiangqiCase>()
  for (const officialCase of cases) {
    if (caseById.has(officialCase.id)) throw new Error(`Fixture id 重复：${officialCase.id}`)
    if (new Set(officialCase.coverageIds).size !== officialCase.coverageIds.length) {
      fail(officialCase, 'coverageIds 存在重复值')
    }
    caseById.set(officialCase.id, officialCase)
  }

  for (const officialCase of cases) {
    for (const coverageId of officialCase.coverageIds) {
      const entry = coverageById.get(coverageId)
      if (!entry) fail(officialCase, `coverageIds 引用了不存在的 Coverage：${coverageId}`)
      if (!entry.requiredCaseIds.includes(officialCase.id)) {
        fail(officialCase, `声明属于 ${coverageId}，但该 Coverage 的 requiredCaseIds 未包含本 Fixture`)
      }
    }
    for (const entry of coverage) {
      if (entry.requiredCaseIds.includes(officialCase.id) && !officialCase.coverageIds.includes(entry.id)) {
        fail(officialCase, `${entry.id}.requiredCaseIds 包含本 Fixture，但 coverageIds 未反向声明`)
      }
    }
  }
  return true
}

export interface DerivedCoverageEntry extends RuleCoverageEntry {
  fixtureIds: string[]
  status: 'pending' | 'partial' | 'passed'
}

export function deriveOfficialCoverage(
  coverage: RuleCoverageEntry[],
  cases: OfficialXiangqiCase[],
  results: OfficialCaseResult[],
): DerivedCoverageEntry[] {
  assertOfficialCoverageIntegrity(coverage, cases)
  const passed = new Set(results.filter((result) => result.passed).map((result) => result.caseId))
  const available = new Set(cases.map((item) => item.id))
  return coverage.map((entry) => {
    const fixtureIds = entry.requiredCaseIds.filter((id) => available.has(id))
    const passedCount = entry.requiredCaseIds.filter((id) => passed.has(id)).length
    return {
      ...entry,
      fixtureIds,
      status: passedCount === entry.requiredCaseIds.length
        ? 'passed'
        : passedCount > 0
          ? 'partial'
          : 'pending',
    }
  })
}

export function formatOfficialCoverage(matrix: DerivedCoverageEntry[]): string {
  return matrix.map((entry) => `${entry.id.padEnd(26)} ${entry.status.toUpperCase()} (${entry.fixtureIds.length}/${entry.requiredCaseIds.length})`).join('\n')
}

export function formatOfficialCaseReport(cases: OfficialXiangqiCase[], results: OfficialCaseResult[]): string {
  const passed = new Set(results.filter((result) => result.passed).map((result) => result.caseId))
  const lines: string[] = ['2020 Xiangqi Rule Coverage']
  for (const chapter of [8, 9] as const) {
    const chapterCases = cases.filter((item) => item.chapter === chapter)
    lines.push('', `Chapter ${chapter}`)
    if (chapterCases.length === 0) lines.push('(pending)')
    else for (const officialCase of chapterCases) {
      lines.push(`Figure ${String(officialCase.figure).padEnd(4)} ${passed.has(officialCase.id) ? 'PASS' : 'PENDING'}  ${officialCase.title}`)
    }
  }
  lines.push('', `Official fixtures: ${passed.size} / ${cases.length}`)
  return lines.join('\n')
}
