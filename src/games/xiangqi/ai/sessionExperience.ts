export const XIANGQI_SESSION_EXPERIENCE_KEY = 'xiangqi:session-experience:v1'

export interface XiangqiSessionExperience {
  games: number
  wins: number
  losses: number
  draws: number
  recurringIssues: string[]
}

const EMPTY: XiangqiSessionExperience = { games: 0, wins: 0, losses: 0, draws: 0, recurringIssues: [] }

export function loadXiangqiSessionExperience(): XiangqiSessionExperience {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(XIANGQI_SESSION_EXPERIENCE_KEY) ?? 'null')
    if (!parsed || typeof parsed !== 'object') return { ...EMPTY }
    const value = parsed as Partial<XiangqiSessionExperience>
    if (![value.games, value.wins, value.losses, value.draws].every((item) => Number.isInteger(item) && Number(item) >= 0) || !Array.isArray(value.recurringIssues)) return { ...EMPTY }
    return { games: value.games!, wins: value.wins!, losses: value.losses!, draws: value.draws!, recurringIssues: value.recurringIssues.filter((item): item is string => typeof item === 'string').slice(-8) }
  } catch { return { ...EMPTY } }
}

export function saveXiangqiSessionExperience(value: XiangqiSessionExperience) {
  sessionStorage.setItem(XIANGQI_SESSION_EXPERIENCE_KEY, JSON.stringify(value))
}
