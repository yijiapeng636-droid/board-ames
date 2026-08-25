import { serializeXiangqiBoard } from '@/games/xiangqi/core/board'
import { applyXiangqiMove, generateLegalMoves, isInCheck, isSquareAttacked } from '@/games/xiangqi/core/legalMoves'
import type {
  XiangqiAdjudication,
  XiangqiBoard,
  XiangqiMove,
  XiangqiMoveClassification,
  XiangqiMoveEffect,
  XiangqiPositionHistoryEntry,
  XiangqiSide,
} from '@/games/xiangqi/types/xiangqi'

export function createPositionKey(board: XiangqiBoard, sideToMove: XiangqiSide): string {
  return `${serializeXiangqiBoard(board)}|turn:${sideToMove}`
}

export function classifyXiangqiMove(board: XiangqiBoard, move: XiangqiMove): XiangqiMoveClassification {
  const next = applyXiangqiMove(board, move)
  const opponent: XiangqiSide = move.side === 'red' ? 'black' : 'red'
  const effects = new Set<XiangqiMoveEffect>()
  const targets: string[] = []
  const evidence: string[] = []

  if (isInCheck(next, opponent)) {
    effects.add('check')
    evidence.push('走子后直接攻击对方将帅')
  }
  if (move.captured) {
    effects.add('capture')
    targets.push(move.captured.id)
    evidence.push(`吃子:${move.captured.id}`)
  }
  for (let row = 0; row < next.length; row += 1) {
    for (let col = 0; col < (next[row]?.length ?? 0); col += 1) {
      const target = next[row]?.[col]
      if (!target || target.side !== opponent || target.type === 'general') continue
      if (isSquareAttacked(next, { row, col }, move.side)) targets.push(target.id)
    }
  }
  if (targets.length > 0) {
    effects.add('capture')
    evidence.push(`走子后形成攻击:${[...new Set(targets)].join(',')}`)
  }
  const movedPieceAttacked = isSquareAttacked(next, move.to, opponent)
  if (movedPieceAttacked && targets.length > 0) {
    effects.add('exchange')
    evidence.push('走动棋子与目标互相接触')
  } else if (movedPieceAttacked) {
    effects.add('sacrifice')
    evidence.push('走动棋子进入对方攻击范围')
  }
  const mateThreat = generateLegalMoves(next, move.side).some((candidate) => {
    const afterThreat = applyXiangqiMove(next, candidate)
    return isInCheck(afterThreat, opponent) && generateLegalMoves(afterThreat, opponent).length === 0
  })
  if (mateThreat) {
    effects.add('kill')
    evidence.push('下一着存在将死威胁')
  }
  if (effects.size === 0) effects.add('idle')

  const ordered: XiangqiMoveEffect[] = ['check', 'kill', 'capture', 'exchange', 'sacrifice', 'block', 'idle']
  const effectList = ordered.filter((effect) => effects.has(effect))
  const primaryEffect = effectList.includes('check')
    ? 'check'
    : effectList.includes('kill')
      ? 'kill'
      : effectList.includes('capture')
        ? 'capture'
        : effectList[0] ?? 'idle'
  return {
    side: move.side,
    effects: effectList,
    primaryEffect,
    targetPieceIds: [...new Set(targets)],
    ruleReference: primaryEffect === 'check' ? '24.1' : primaryEffect === 'kill' ? '24.2' : primaryEffect === 'capture' ? '24.3,26.4' : '24.4-24.8',
    evidence,
  }
}

export function findRepetitionCycle(history: XiangqiPositionHistoryEntry[]) {
  const latest = history[history.length - 1]
  if (!latest) return null
  const occurrences = history.flatMap((entry, index) => (entry.key === latest.key ? [index] : []))
  if (occurrences.length < 3) return null
  const start = occurrences[occurrences.length - 3]!
  return { start, end: history.length - 1, entries: history.slice(start + 1) }
}

function isForbidden(classifications: XiangqiMoveClassification[]): boolean {
  return classifications.length > 0 && classifications.every((item) =>
    ['check', 'kill', 'capture'].includes(item.primaryEffect),
  )
}

export function adjudicateRepetition(
  history: XiangqiPositionHistoryEntry[],
  mustChangeSide: XiangqiSide | null = null,
): XiangqiAdjudication {
  const cycle = findRepetitionCycle(history)
  if (!cycle) return { verdict: 'none', responsibleSide: null, reason: '尚未形成三次循环', ruleReference: '24.9-24.14', cycleStart: null, cycleEnd: null }
  const red = cycle.entries.flatMap((entry) => entry.classification?.side === 'red' ? [entry.classification] : [])
  const black = cycle.entries.flatMap((entry) => entry.classification?.side === 'black' ? [entry.classification] : [])
  const redForbidden = isForbidden(red)
  const blackForbidden = isForbidden(black)
  let responsibleSide: XiangqiSide | null = null
  if (redForbidden !== blackForbidden) responsibleSide = redForbidden ? 'red' : 'black'
  if (mustChangeSide && responsibleSide === mustChangeSide) {
    return { verdict: 'loss', responsibleSide, reason: '已被要求变着后继续禁止循环', ruleReference: '4.1.5,25.3', cycleStart: cycle.start, cycleEnd: cycle.end }
  }
  if (responsibleSide) return { verdict: 'mustChange', responsibleSide, reason: '单方形成禁止着法循环', ruleReference: '25.1-25.3,26.9', cycleStart: cycle.start, cycleEnd: cycle.end }
  return { verdict: 'draw', responsibleSide: null, reason: '双方责任相同，不变作和', ruleReference: '25.2,26.9.4', cycleStart: cycle.start, cycleEnd: cycle.end }
}
