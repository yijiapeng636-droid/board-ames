import { serializeXiangqiBoard } from '@/games/xiangqi/core/board'
import type {
  XiangqiAdjudication,
  XiangqiBoard,
  XiangqiMoveClassification,
  XiangqiPositionHistoryEntry,
  XiangqiSide,
} from '@/games/xiangqi/types/xiangqi'

export { classifyXiangqiMove } from '@/games/xiangqi/rules/classification'

export function createPositionKey(board: XiangqiBoard, sideToMove: XiangqiSide): string {
  return `${serializeXiangqiBoard(board)}|turn:${sideToMove}`
}

export function findRepetitionCycle(history: XiangqiPositionHistoryEntry[]) {
  const latest = history[history.length - 1]
  if (!latest) return null
  const occurrences = history.flatMap((entry, index) => (entry.key === latest.key ? [index] : []))
  if (occurrences.length < 3) return null
  const start = occurrences[occurrences.length - 3]!
  return { start, end: history.length - 1, entries: history.slice(start + 1) }
}

interface CycleProfile {
  forbidden: boolean
  allCheck: boolean
  allKill: boolean
  checkKill: boolean
  chaseRook: boolean
  chaseUnprotected: boolean
  jointChaseRook: boolean
  jointChaseUnprotected: boolean
}

function profile(classifications: XiangqiMoveClassification[]): CycleProfile {
  const all = (effects: string[]) => classifications.length > 0
    && classifications.every((item) => effects.includes(item.primaryEffect) && item.forbidden !== false)
  const chase = classifications.flatMap((item) => item.chaseEvidence ?? [])
  const allChase = all(['capture']) && chase.length > 0
  return {
    forbidden: all(['check', 'kill', 'capture']),
    allCheck: all(['check']),
    allKill: all(['kill']),
    checkKill: all(['check', 'kill'])
      && classifications.some((item) => item.primaryEffect === 'check')
      && classifications.some((item) => item.primaryEffect === 'kill'),
    chaseRook: allChase && chase.every((item) => item.targetPieceType === 'rook' && !item.joint),
    chaseUnprotected: allChase && chase.every((item) => !item.protected && !item.joint),
    jointChaseRook: allChase && chase.every((item) => item.targetPieceType === 'rook' && item.joint),
    jointChaseUnprotected: allChase && chase.every((item) => !item.protected && item.joint),
  }
}

function createRuling(
  verdict: XiangqiAdjudication['verdict'],
  responsibleSide: XiangqiSide | null,
  reason: string,
  ruleReference: string,
  cycle: { start: number; end: number },
): XiangqiAdjudication {
  return { verdict, responsibleSide, reason, ruleReference, cycleStart: cycle.start, cycleEnd: cycle.end }
}

function bothForbiddenResponsibleSide(red: CycleProfile, black: CycleProfile): XiangqiSide | null {
  if (red.chaseRook && black.jointChaseRook) return 'red'
  if (black.chaseRook && red.jointChaseRook) return 'black'
  if (red.chaseUnprotected && black.jointChaseUnprotected) return 'red'
  if (black.chaseUnprotected && red.jointChaseUnprotected) return 'black'

  const redSpecific = red.allKill || red.checkKill || red.chaseRook || red.chaseUnprotected
  const blackSpecific = black.allKill || black.checkKill || black.chaseRook || black.chaseUnprotected
  if (redSpecific !== blackSpecific) return redSpecific ? 'red' : 'black'
  return null
}

export function adjudicateRepetition(
  history: XiangqiPositionHistoryEntry[],
  mustChangeSide: XiangqiSide | null = null,
): XiangqiAdjudication {
  const cycle = findRepetitionCycle(history)
  if (!cycle) {
    return { verdict: 'none', responsibleSide: null, reason: '尚未形成三次循环', ruleReference: '24.9-24.14', cycleStart: null, cycleEnd: null }
  }
  const red = profile(cycle.entries.flatMap((entry) => entry.classification?.side === 'red' ? [entry.classification] : []))
  const black = profile(cycle.entries.flatMap((entry) => entry.classification?.side === 'black' ? [entry.classification] : []))

  let responsibleSide: XiangqiSide | null = null
  let ruleReference = '25.2,26.9.4'
  let reason = '双方均为允许着法或禁止着法责任相同，不变作和'

  if (red.allCheck !== black.allCheck) {
    responsibleSide = red.allCheck ? 'red' : 'black'
    ruleReference = '25.1'
    reason = '任何情况下均不允许单方面长将'
  } else if (red.forbidden !== black.forbidden) {
    responsibleSide = red.forbidden ? 'red' : 'black'
    ruleReference = '25.3'
    reason = '一方为禁止着法、另一方为允许着法，禁止着法方必须变着'
  } else if (red.forbidden && black.forbidden) {
    responsibleSide = bothForbiddenResponsibleSide(red, black)
    if (responsibleSide) {
      ruleReference = '26.9.1-26.9.3'
      reason = '双方均为禁止着法，按长杀、长捉车、长捉无根子及联合捉责任比较变着'
    }
  }

  if (mustChangeSide && responsibleSide === mustChangeSide) {
    return createRuling('loss', responsibleSide, '已被要求变着后仍继续同一禁止着法循环', '4.1.5,25.1,25.3,26.9', cycle)
  }
  if (responsibleSide) return createRuling('mustChange', responsibleSide, reason, ruleReference, cycle)
  return createRuling('draw', null, reason, ruleReference, cycle)
}
