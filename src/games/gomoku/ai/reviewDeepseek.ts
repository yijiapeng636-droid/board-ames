import type {
  GameReview,
  GameResult,
  Move,
  ReviewPoint,
  SessionReviewHistorySummary,
} from '@/games/gomoku/types/gomoku'
import { postJson } from '@/ai/runtime/jsonTransport'

const REVIEW_TIMEOUT_MS = 10_000

function isGameReview(value: unknown): value is GameReview {
  if (!value || typeof value !== 'object') return false
  const review = value as Partial<GameReview>
  return (
    typeof review.summary === 'string' &&
    Array.isArray(review.keyMoments) &&
    review.keyMoments.every(
      (moment) =>
        moment &&
        typeof moment.moveNumber === 'number' &&
        typeof moment.title === 'string' &&
        typeof moment.explanation === 'string' &&
        typeof moment.suggestion === 'string',
    ) &&
    Array.isArray(review.strengths) &&
    review.strengths.every((item) => typeof item === 'string') &&
    Array.isArray(review.recurringIssues) &&
    review.recurringIssues.every((item) => typeof item === 'string') &&
    Array.isArray(review.practiceSuggestions) &&
    review.practiceSuggestions.every((item) => typeof item === 'string')
  )
}

function sanitizeGameReview(review: GameReview, reviewPoints: ReviewPoint[]): GameReview {
  const allowed = new Set(reviewPoints.map((point) => point.moveNumber))
  const seen = new Set<number>()
  return {
    ...review,
    keyMoments: review.keyMoments
      .filter((moment) => {
        if (!allowed.has(moment.moveNumber) || seen.has(moment.moveNumber)) return false
        seen.add(moment.moveNumber)
        return true
      })
      .map((moment) => ({
        ...moment,
        title: stripModelCoordinates(moment.title),
        explanation: stripModelCoordinates(moment.explanation),
        suggestion: stripModelCoordinates(moment.suggestion),
      })),
  }
}

function stripModelCoordinates(text: string) {
  return text
    .replace(/\(?\s*\d{1,2}\s*[,，]\s*\d{1,2}\s*\)?/g, '该位置')
    .replace(/第?\s*\d{1,2}\s*行\s*第?\s*\d{1,2}\s*列/g, '该位置')
}

export async function requestGameReview(
  gameResult: Exclude<GameResult, null>,
  moves: Move[],
  reviewPoints: ReviewPoint[],
  sessionHistory: SessionReviewHistorySummary,
  signal?: AbortSignal,
): Promise<GameReview> {
  const timeoutController = new AbortController()
  const timeout = window.setTimeout(() => timeoutController.abort(), REVIEW_TIMEOUT_MS)
  const abort = () => timeoutController.abort()
  signal?.addEventListener('abort', abort, { once: true })
  try {
    const data = await postJson(
      '/api/gomoku/review',
      { gameResult, moves, reviewPoints, sessionHistory },
      'DeepSeek 复盘请求失败',
      timeoutController.signal,
    )
    if (!isGameReview(data)) throw new Error('DeepSeek 未返回有效的复盘内容')
    return sanitizeGameReview(data, reviewPoints)
  } finally {
    window.clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}
