export function formatGomokuCoordinate(move: { row: number; col: number }) {
  return `(${move.row + 1}, ${move.col + 1})`
}
