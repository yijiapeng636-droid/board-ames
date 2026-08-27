import { cloneXiangqiBoard, oppositeSide } from '@/games/xiangqi/core/board'
import { applyXiangqiMove, generateLegalMoves, isInCheck } from '@/games/xiangqi/core/legalMoves'
import { getXiangqiGameStatus } from '@/games/xiangqi/core/result'
import type {
  XiangqiBoard,
  XiangqiChaseEvidence,
  XiangqiMove,
  XiangqiMoveClassification,
  XiangqiMoveEffect,
  XiangqiMoveOption,
  XiangqiPieceType,
  XiangqiPosition,
  XiangqiSide,
} from '@/games/xiangqi/types/xiangqi'

const PIECE_VALUE: Record<XiangqiPieceType, number> = {
  general: 10_000,
  rook: 9,
  cannon: 4,
  horse: 4,
  elephant: 2,
  advisor: 2,
  pawn: 1,
}

function samePosition(left: XiangqiPosition, right: XiangqiPosition) {
  return left.row === right.row && left.col === right.col
}

function legalCaptures(board: XiangqiBoard, side: XiangqiSide) {
  return generateLegalMoves(board, side).filter((candidate) => candidate.captured?.type !== 'general' && candidate.captured)
}

function attackKey(move: XiangqiMoveOption) {
  return `${move.piece.id}->${move.captured!.id}`
}

function jointAttackerIds(board: XiangqiBoard, attack: XiangqiMoveOption): string[] {
  const participants = [attack.piece.id]
  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < (board[row]?.length ?? 0); col += 1) {
      const piece = board[row]?.[col]
      if (!piece || piece.side !== attack.side || piece.type === 'general' || piece.id === attack.piece.id) continue
      const withoutPiece = cloneXiangqiBoard(board)
      withoutPiece[row]![col] = null
      const attackStillExists = legalCaptures(withoutPiece, attack.side).some((candidate) =>
        candidate.piece.id === attack.piece.id && candidate.captured?.id === attack.captured!.id,
      )
      if (!attackStillExists) participants.push(piece.id)
    }
  }
  return participants
}

function hasImmediateMate(board: XiangqiBoard, attacker: XiangqiSide): boolean {
  return generateLegalMoves(board, attacker).some((candidate) => {
    const next = applyXiangqiMove(board, candidate)
    return getXiangqiGameStatus(next, oppositeSide(attacker)).result === `${attacker}Win`
  })
}

function exchangeGain(
  board: XiangqiBoard,
  sideToMove: XiangqiSide,
  square: XiangqiPosition,
  perspective: XiangqiSide,
  depth = 0,
): number {
  if (depth >= 8) return 0
  const captures = generateLegalMoves(board, sideToMove).filter((candidate) =>
    samePosition(candidate.to, square) && candidate.captured,
  )
  if (captures.length === 0) return 0
  const scores = captures.map((candidate) => {
    const value = PIECE_VALUE[candidate.captured!.type]
    const signedValue = sideToMove === perspective ? value : -value
    return signedValue + exchangeGain(
      applyXiangqiMove(board, candidate),
      oppositeSide(sideToMove),
      square,
      perspective,
      depth + 1,
    )
  })
  return sideToMove === perspective ? Math.max(0, ...scores) : Math.min(0, ...scores)
}

function analyzeChases(before: XiangqiBoard, after: XiangqiBoard, move: XiangqiMove): XiangqiChaseEvidence[] {
  const opponent = oppositeSide(move.side)
  const previousAttacks = new Set(legalCaptures(before, move.side).map(attackKey))
  const newAttacks = legalCaptures(after, move.side).filter((candidate) => !previousAttacks.has(attackKey(candidate)))

  return newAttacks.flatMap((attack) => {
    const afterCapture = applyXiangqiMove(after, attack)
    const immediateMateRisk = hasImmediateMate(afterCapture, opponent)
    const netGain = PIECE_VALUE[attack.captured!.type]
      + exchangeGain(afterCapture, opponent, attack.to, move.side)
    if (immediateMateRisk || netGain <= 0) return []
    const protectedTarget = generateLegalMoves(afterCapture, opponent).some((reply) =>
      samePosition(reply.to, attack.to) && reply.captured?.id === attack.piece.id,
    )
    const attackerPieceIds = jointAttackerIds(after, attack)
    return [{
      targetPieceId: attack.captured!.id,
      targetPieceType: attack.captured!.type,
      attackerPieceIds,
      direct: attack.piece.id === move.piece.id,
      joint: attackerPieceIds.length > 1,
      protected: protectedTarget,
      netGain,
      immediateMateRisk,
    } satisfies XiangqiChaseEvidence]
  })
}

function hasForcedCheckingMate(
  board: XiangqiBoard,
  attacker: XiangqiSide,
  sideToMove: XiangqiSide,
  checksRemaining: number,
): boolean {
  const status = getXiangqiGameStatus(board, sideToMove)
  if (status.result) return status.result === `${attacker}Win`
  if (checksRemaining <= 0) return false
  if (sideToMove === attacker) {
    return status.legalMoves.some((candidate) => {
      const next = applyXiangqiMove(board, candidate)
      return isInCheck(next, oppositeSide(attacker))
        && hasForcedCheckingMate(next, attacker, oppositeSide(attacker), checksRemaining - 1)
    })
  }
  return status.legalMoves.length > 0 && status.legalMoves.every((reply) =>
    hasForcedCheckingMate(applyXiangqiMove(board, reply), attacker, attacker, checksRemaining),
  )
}

function detectsBlock(before: XiangqiBoard, after: XiangqiBoard, opponent: XiangqiSide): boolean {
  return generateLegalMoves(after, opponent).length < generateLegalMoves(before, opponent).length
}

export function classifyXiangqiMove(board: XiangqiBoard, move: XiangqiMove): XiangqiMoveClassification {
  const next = applyXiangqiMove(board, move)
  const opponent = oppositeSide(move.side)
  const wasInCheck = isInCheck(board, move.side)
  const effects = new Set<XiangqiMoveEffect>()
  const evidence: string[] = []

  if (isInCheck(next, opponent)) {
    effects.add('check')
    evidence.push('24.1：走子后直接攻击对方帅（将）')
  }

  const generalResponseException = wasInCheck && move.piece.type === 'general'
  const rawChases = analyzeChases(board, next, move)
  const onlyGeneralOrPawnDirectChase = rawChases.length > 0
    && rawChases.every((item) => item.direct)
    && (move.piece.type === 'general' || move.piece.type === 'pawn')
  const chaseEvidence = generalResponseException || onlyGeneralOrPawnDirectChase ? [] : rawChases

  if (chaseEvidence.length > 0) {
    effects.add('capture')
    evidence.push(`24.3：形成新的净得子手段，目标 ${[...new Set(chaseEvidence.map((item) => item.targetPieceId))].join(',')}`)
  } else if (rawChases.length > 0) {
    evidence.push(generalResponseException
      ? '26.1.2：帅（将）应将后产生的捉按闲处理'
      : '26.1：帅（将）、兵（卒）本身长捉按允许着法处理')
  }

  const kill = !generalResponseException
    && !effects.has('check')
    && hasForcedCheckingMate(next, move.side, opponent, 2)
  if (kill) {
    effects.add('kill')
    evidence.push('24.2：已验证对方全部合法应对后仍存在连续将军成杀')
  }

  const opponentCapturesMovedPiece = generateLegalMoves(next, opponent).filter((candidate) =>
    samePosition(candidate.to, move.to) && candidate.captured?.id === move.piece.id,
  )
  const sameKindExchange = opponentCapturesMovedPiece.some((candidate) =>
    candidate.piece.type === move.piece.type
      && !hasImmediateMate(applyXiangqiMove(next, candidate), move.side)
      && PIECE_VALUE[move.piece.type] + exchangeGain(applyXiangqiMove(next, candidate), move.side, move.to, opponent) >= 0,
  )
  if (sameKindExchange) {
    effects.add('exchange')
    evidence.push('24.4：同兵种邀兑，接受方不会立即被杀或遭受子力损失')
  } else if (opponentCapturesMovedPiece.some((candidate) =>
    !hasImmediateMate(applyXiangqiMove(next, candidate), move.side)
      && PIECE_VALUE[move.piece.type] + exchangeGain(applyXiangqiMove(next, candidate), move.side, move.to, opponent) >= 0,
  )) {
    effects.add('sacrifice')
    evidence.push('24.5：走动子送吃，接受方不会立即被杀或遭受子力损失')
  }

  if (effects.size === 0 && detectsBlock(board, next, opponent)) {
    effects.add('block')
    evidence.push('24.6：限制对方棋子活动且没有形成攻击作用')
  }
  if (effects.size === 0) {
    effects.add('idle')
    evidence.push('24.8：不属于将、杀、捉，按闲处理')
  }

  let primaryEffect: XiangqiMoveClassification['primaryEffect'] = 'idle'
  if (effects.has('check')) primaryEffect = 'check'
  else if (effects.has('kill')) primaryEffect = 'kill'
  else if (effects.has('capture')) primaryEffect = 'capture'
  else if (effects.has('exchange')) primaryEffect = 'exchange'
  else if (effects.has('sacrifice')) primaryEffect = 'sacrifice'
  else if (effects.has('block')) primaryEffect = 'block'

  return {
    side: move.side,
    effects: [...effects],
    primaryEffect,
    targetPieceIds: [...new Set(chaseEvidence.map((item) => item.targetPieceId))],
    ruleReference: primaryEffect === 'check'
      ? '24.1,25.1'
      : primaryEffect === 'kill'
        ? '24.2,26.4'
        : primaryEffect === 'capture'
          ? '24.3,24.15-24.17,26.1,26.4-26.8'
          : '24.4-24.8,26.4-26.6,26.10-26.11',
    evidence,
    chaseEvidence,
    forbidden: ['check', 'kill', 'capture'].includes(primaryEffect),
  }
}
