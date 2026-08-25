import {
  XIANGQI_COLS,
  XIANGQI_ROWS,
  type XiangqiBoard,
  type XiangqiPiece,
  type XiangqiPieceType,
  type XiangqiSide,
} from '@/games/xiangqi/types/xiangqi'

const BACK_RANK: XiangqiPieceType[] = [
  'rook',
  'horse',
  'elephant',
  'advisor',
  'general',
  'advisor',
  'elephant',
  'horse',
  'rook',
]

function piece(side: XiangqiSide, type: XiangqiPieceType, index: number): XiangqiPiece {
  return { id: `${side}-${type}-${index}`, side, type }
}

function emptyBoard(): XiangqiBoard {
  return Array.from({ length: XIANGQI_ROWS }, () =>
    Array<XiangqiBoard[number][number]>(XIANGQI_COLS).fill(null),
  )
}

function placeArmy(board: XiangqiBoard, side: XiangqiSide) {
  const backRow = side === 'black' ? 0 : 9
  const cannonRow = side === 'black' ? 2 : 7
  const pawnRow = side === 'black' ? 3 : 6
  const counts = new Map<XiangqiPieceType, number>()

  BACK_RANK.forEach((type, col) => {
    const index = (counts.get(type) ?? 0) + 1
    counts.set(type, index)
    board[backRow]![col] = piece(side, type, index)
  })
  board[cannonRow]![1] = piece(side, 'cannon', 1)
  board[cannonRow]![7] = piece(side, 'cannon', 2)
  for (let col = 0, index = 1; col < XIANGQI_COLS; col += 2, index += 1) {
    board[pawnRow]![col] = piece(side, 'pawn', index)
  }
}

export function createInitialXiangqiBoard(): XiangqiBoard {
  const board = emptyBoard()
  placeArmy(board, 'black')
  placeArmy(board, 'red')
  return board
}

export function cloneXiangqiBoard(board: XiangqiBoard): XiangqiBoard {
  return board.map((row) => row.map((item) => (item ? { ...item } : null)))
}

export function serializeXiangqiBoard(board: XiangqiBoard): string {
  return board
    .map((row) =>
      row.map((item) => (item ? `${item.side[0]}:${item.type}:${item.id}` : '.')).join(','),
    )
    .join('/')
}

export function oppositeSide(side: XiangqiSide): XiangqiSide {
  return side === 'red' ? 'black' : 'red'
}
