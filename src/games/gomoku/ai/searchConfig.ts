export const SEARCH_CONFIG = {
  candidateRadius: 2,
  candidatePoolLimit: 28,
  branchLimit: 7,
  finalCandidateLimit: 5,
  // Initial engineering cap for strategic breadth; benchmark tuning may change it later.
  strategyCandidateLimit: 12,
  agentAcceptableScoreMargin: 5_000,
  maxDepth: 3,
  maxMs: 1_200,
  threatMaxPly: 9,
  threatMaxMs: 600,
  extensionDepth: 2,
  maxExtensionNodes: 5_000,
  sessionGameLimit: 20,
} as const

export const SEARCH_WIN_SCORE = 100_000_000

export const PATTERN_SCORES = {
  five: SEARCH_WIN_SCORE,
  openFour: 400_000,
  closedFour: 90_000,
  brokenFour: 90_000,
  openThree: 14_000,
  brokenThree: 14_000,
  closedThree: 2_200,
  openTwo: 500,
} as const
