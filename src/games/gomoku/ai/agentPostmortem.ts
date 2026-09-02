import { findWinningMoves } from '@/games/gomoku/ai/threatAnalysis'
import { SEARCH_CONFIG } from '@/games/gomoku/ai/searchConfig'
import { searchFixedCandidate, searchPosition } from '@/games/gomoku/ai/search'
import { inspectGomokuPosition } from '@/games/gomoku/ai/strategy/positionInspection'
import { createBoard } from '@/games/gomoku/core/game'
import { getWinner } from '@/games/gomoku/core/winner'
import type { GameResult, GomokuAIDiagnostic, Player } from '@/games/gomoku/types/gomoku'
import type { AIDecisionRecord, GameHistoryMove } from '@/games/gomoku/ai/sessionExperience'

const POSTMORTEM_SEARCH_MAX_MS = 180
const EVALUATION_GAP_THRESHOLD = 4_000

export type AgentPostmortemCode =
  | 'missed_forced_win'
  | 'missed_critical_defense'
  | 'unsafe_agent_override'
  | 'threat_search_miss'
  | 'evaluation_misrank'

export type AgentPostmortemSeverity = 'warning' | 'critical'

export interface AgentPostmortemFinding {
  code: AgentPostmortemCode
  severity: AgentPostmortemSeverity
  message: string
  moveNumber: number
  positionKey: string
  selectedMove: { row: number; col: number }
  recommendedMove?: { row: number; col: number }
  evidence: string[]
}

export interface AgentPostmortemInput {
  aiPlayer: Player
  result?: Exclude<GameResult, null>
  moves: GameHistoryMove[]
  aiDecisions: AIDecisionRecord[]
  aiDiagnostics: GomokuAIDiagnostic[]
}

function same(left: { row: number; col: number }, right: { row: number; col: number }) {
  return left.row === right.row && left.col === right.col
}

function boardPositionKey(board: number[][], player: Player) {
  return `${board.map((line) => line.join('')).join('')}|${player}`
}

function aiLost(result: Exclude<GameResult, null> | undefined, aiPlayer: Player) {
  return (result === 'blackWin' && aiPlayer === 2) || (result === 'whiteWin' && aiPlayer === 1)
}

function activeMainline(moves: readonly GameHistoryMove[]) {
  return moves.filter((move) => move.revertedAt === undefined)
}

function decisionForMove(
  move: GameHistoryMove,
  decisions: readonly AIDecisionRecord[],
  usedDecisionIndexes: Set<number>,
) {
  const linkedIndex = decisions.findIndex(
    (decision, index) =>
      !usedDecisionIndexes.has(index) &&
      decision.moveId !== undefined &&
      decision.moveId === move.id,
  )

  if (linkedIndex >= 0) {
    usedDecisionIndexes.add(linkedIndex)
    return decisions[linkedIndex]
  }

  const compatibleIndex = decisions.findIndex(
    (decision, index) =>
      !usedDecisionIndexes.has(index) &&
      (decision.moveNumber === undefined || decision.moveNumber === move.turn) &&
      same(decision.selectedMove, move),
  )

  if (compatibleIndex < 0) return undefined
  usedDecisionIndexes.add(compatibleIndex)
  return decisions[compatibleIndex]
}

function diagnosticForMove(move: GameHistoryMove, diagnostics: readonly GomokuAIDiagnostic[]) {
  return diagnostics.find((diagnostic) => diagnostic.moveNumber === move.turn)
}

function addFinding(findings: AgentPostmortemFinding[], finding: AgentPostmortemFinding) {
  if (
    findings.some(
      (existing) => existing.code === finding.code && existing.moveNumber === finding.moveNumber,
    )
  ) {
    return
  }

  findings.push(finding)
}

export function analyzeAgentPostmortem(input: AgentPostmortemInput): AgentPostmortemFinding[] {
  const board = createBoard()
  const findings: AgentPostmortemFinding[] = []
  const usedDecisionIndexes = new Set<number>()
  const lost = aiLost(input.result, input.aiPlayer)

  for (const move of activeMainline(input.moves)) {
    if (board[move.row]?.[move.col] !== 0) continue

    if (move.player === input.aiPlayer) {
      const decision = decisionForMove(move, input.aiDecisions, usedDecisionIndexes)
      const diagnostic = diagnosticForMove(move, input.aiDiagnostics)
      const selectedMove = { row: move.row, col: move.col }
      const positionKey = decision?.positionKey ?? boardPositionKey(board, input.aiPlayer)
      const immediateWins = findWinningMoves(board, input.aiPlayer)
      const selectedIsImmediateWin = immediateWins.some((candidate) =>
        same(candidate, selectedMove),
      )
      const defense = inspectGomokuPosition(board, input.aiPlayer).mandatoryDefense

      const reviewSearch = searchPosition(board, {
        rootPlayer: input.aiPlayer,
        maxDepth: 3,
        maxMs: POSTMORTEM_SEARCH_MAX_MS,
        branchLimit: SEARCH_CONFIG.branchLimit,
        candidatePoolLimit: SEARCH_CONFIG.candidatePoolLimit,
        finalCandidateLimit: SEARCH_CONFIG.finalCandidateLimit,
        threatMaxPly: SEARCH_CONFIG.threatMaxPly,
      })
      const reviewBest = reviewSearch.candidates[0]
      const reviewProvesSelected =
        reviewBest !== undefined &&
        same(reviewBest, selectedMove) &&
        (reviewSearch.forcedMoveType === 'forcedWin' ||
          reviewSearch.forcedMoveType === 'forcedTactical')

      if (immediateWins.length > 0 && !selectedIsImmediateWin) {
        addFinding(findings, {
          code: 'missed_forced_win',
          severity: 'critical',
          message: 'AI 存在立即五连点，但实际落子没有完成胜利。',
          moveNumber: move.turn,
          positionKey,
          selectedMove,
          recommendedMove: {
            row: immediateWins[0]!.row,
            col: immediateWins[0]!.col,
          },
          evidence: [
            `immediate_wins:${immediateWins.length}`,
            `decision_source:${decision?.source ?? 'unknown'}`,
          ],
        })
      }

      if (
        defense.required &&
        !defense.unavoidable &&
        !selectedIsImmediateWin &&
        !reviewProvesSelected &&
        !defense.moves.some((candidate) => same(candidate, selectedMove))
      ) {
        addFinding(findings, {
          code: 'missed_critical_defense',
          severity: 'critical',
          message: 'AI 在没有已证明强制胜的情况下忽略了必须处理的关键防守。',
          moveNumber: move.turn,
          positionKey,
          selectedMove,
          ...(defense.moves[0]
            ? {
                recommendedMove: {
                  row: defense.moves[0].row,
                  col: defense.moves[0].col,
                },
              }
            : {}),
          evidence: [
            `defense_urgency:${defense.urgency}`,
            `defense_moves:${defense.moves.length}`,
            `decision_source:${decision?.source ?? 'unknown'}`,
          ],
        })
      }

      if (
        reviewSearch.forcedMoveType === 'forcedTactical' &&
        decision?.source !== 'forcedTactical' &&
        diagnostic?.threatSearchStatus !== 'proven_win' &&
        reviewBest
      ) {
        addFinding(findings, {
          code: 'threat_search_miss',
          severity: same(reviewBest, selectedMove) ? 'warning' : 'critical',
          message: '局后更充分的 Threat Search 证明存在强制胜，但实战搜索没有证明该路线。',
          moveNumber: move.turn,
          positionKey,
          selectedMove,
          recommendedMove: { row: reviewBest.row, col: reviewBest.col },
          evidence: [
            `live_threat_status:${diagnostic?.threatSearchStatus ?? 'unknown'}`,
            'postgame_threat_status:proven_win',
            `postgame_search_depth:${reviewSearch.metrics.searchDepth}`,
          ],
        })
      }

      if (
        decision?.source === 'deepseek' &&
        decision.localBestMove &&
        !same(decision.localBestMove, selectedMove)
      ) {
        const recordedGap =
          decision.localBestScore !== undefined && decision.searchScore !== undefined
            ? decision.localBestScore - decision.searchScore
            : 0

        const after = board.map((line) => [...line])
        after[selectedMove.row]![selectedMove.col] = input.aiPlayer
        const won = getWinner(after, selectedMove.row, selectedMove.col) === input.aiPlayer
        const leavesCriticalDefense =
          !won && inspectGomokuPosition(after, input.aiPlayer).mandatoryDefense.required

        if (recordedGap > SEARCH_CONFIG.agentAcceptableScoreMargin || leavesCriticalDefense) {
          addFinding(findings, {
            code: 'unsafe_agent_override',
            severity: 'critical',
            message: 'Agent 覆盖了本地搜索候选，并产生了明显分差或未解决的强制威胁。',
            moveNumber: move.turn,
            positionKey,
            selectedMove,
            recommendedMove: {
              row: decision.localBestMove.row,
              col: decision.localBestMove.col,
            },
            evidence: [
              `recorded_score_gap:${recordedGap}`,
              `leaves_critical_defense:${leavesCriticalDefense}`,
            ],
          })
        }
      }

      const originalLocalBest = decision?.localBestMove
      if (
        originalLocalBest &&
        reviewBest &&
        !same(originalLocalBest, reviewBest) &&
        reviewSearch.forcedMoveType === null &&
        !defense.required &&
        immediateWins.length === 0 &&
        (lost || decision?.source !== 'deepseek')
      ) {
        try {
          const originalSearch = searchFixedCandidate(board, originalLocalBest, input.aiPlayer, {
            maxDepth: 3,
            maxMs: POSTMORTEM_SEARCH_MAX_MS,
            branchLimit: SEARCH_CONFIG.branchLimit,
            threatMaxPly: SEARCH_CONFIG.threatMaxPly,
          })

          const scoreGap = reviewBest.searchScore - originalSearch.searchScore
          if (!originalSearch.timedOut && scoreGap >= EVALUATION_GAP_THRESHOLD) {
            addFinding(findings, {
              code: 'evaluation_misrank',
              severity: 'warning',
              message: '局后同量纲搜索发现本地实战首选明显低于另一候选，建议检查评估或搜索排序。',
              moveNumber: move.turn,
              positionKey,
              selectedMove,
              recommendedMove: { row: reviewBest.row, col: reviewBest.col },
              evidence: [
                `postgame_score_gap:${scoreGap}`,
                `live_local_best:${originalLocalBest.row},${originalLocalBest.col}`,
                `postgame_best:${reviewBest.row},${reviewBest.col}`,
              ],
            })
          }
        } catch {
          // Historical records can be incomplete; skip unverifiable ranking evidence.
        }
      }
    }

    board[move.row]![move.col] = move.player
  }

  return findings
}
