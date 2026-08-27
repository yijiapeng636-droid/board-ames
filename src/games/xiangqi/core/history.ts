import { cloneXiangqiBoard, oppositeSide } from '@/games/xiangqi/core/board'
import type {
  XiangqiBoard,
  XiangqiMove,
  XiangqiPositionHistoryEntry,
  XiangqiReplayState,
  XiangqiSide,
} from '@/games/xiangqi/types/xiangqi'

export function cloneXiangqiMove(move: XiangqiMove): XiangqiMove {
  return {
    ...move,
    from: { ...move.from },
    to: { ...move.to },
    piece: { ...move.piece },
    captured: move.captured ? { ...move.captured } : null,
  }
}

export function cloneXiangqiHistory(history: XiangqiPositionHistoryEntry[]): XiangqiPositionHistoryEntry[] {
  return history.map((entry) => ({
    ...entry,
    move: entry.move ? cloneXiangqiMove(entry.move) : null,
    classification: entry.classification ? {
      ...entry.classification,
      effects: [...entry.classification.effects],
      targetPieceIds: [...entry.classification.targetPieceIds],
      evidence: [...entry.classification.evidence],
      chaseEvidence: entry.classification.chaseEvidence.map((item) => ({
        ...item,
        attackerPieceIds: [...item.attackerPieceIds],
      })),
    } : null,
  }))
}

function samePiece(
  left: XiangqiBoard[number][number] | undefined,
  right: XiangqiMove['piece'],
): boolean {
  return Boolean(
    left && left.id === right.id && left.side === right.side && left.type === right.type,
  )
}

export function replayXiangqiHistory(
  initialBoard: XiangqiBoard,
  moves: XiangqiMove[],
  moveCount: number = moves.length,
): XiangqiReplayState {
  if (!Number.isInteger(moveCount) || moveCount < 0 || moveCount > moves.length) {
    throw new Error('历史节点超出着法范围')
  }
  const board = cloneXiangqiBoard(initialBoard)
  let sideToMove: XiangqiSide = 'red'

  for (const move of moves.slice(0, moveCount)) {
    const movingPiece = board[move.from.row]?.[move.from.col]
    if (move.side !== sideToMove || !samePiece(movingPiece, move.piece)) {
      throw new Error(`第 ${move.turn} 手无法从历史确定性重建`)
    }
    const target = board[move.to.row]?.[move.to.col]
    if ((target?.id ?? null) !== (move.captured?.id ?? null)) {
      throw new Error(`第 ${move.turn} 手被吃棋子与历史不一致`)
    }
    board[move.from.row]![move.from.col] = null
    board[move.to.row]![move.to.col] = { ...move.piece }
    sideToMove = move.nextSideToMove ?? oppositeSide(sideToMove)
  }

  return { board, sideToMove }
}
