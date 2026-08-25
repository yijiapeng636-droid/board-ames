import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestAIMove } from '@/games/gomoku/ai/deepseek'
import { createBoard } from '@/games/gomoku/core/game'

afterEach(() => vi.unstubAllGlobals())

describe('DeepSeek client payload', () => {
  it('sends searched candidates, PV, and only relevant session experience', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ row: 7, col: 8, reason: '综合搜索结果' }),
    } as Response)
    vi.stubGlobal('fetch', fetchMock)
    await requestAIMove(
      createBoard(),
      [],
      [
        {
          row: 7,
          col: 8,
          staticScore: 900,
          searchScore: 3200,
          features: ['openThree'],
          principalVariation: [
            { player: 'white', row: 7, col: 8 },
            { player: 'black', row: 7, col: 9 },
          ],
        },
      ],
      {
        seen: 1,
        moves: [{ row: 7, col: 8, played: 1, finalResults: { win: 0, loss: 1, draw: 0 } }],
      },
    )

    const options = fetchMock.mock.calls[0]?.[1]
    const payload = JSON.parse(String(options?.body)) as {
      game: Record<string, unknown>
    }
    expect(payload.game).toMatchObject({
      board: expect.any(Array),
      moves: [],
      searchedCandidates: [
        expect.objectContaining({
          row: 7,
          col: 8,
          staticScore: 900,
          searchScore: 3200,
          principalVariation: expect.any(Array),
        }),
      ],
      sessionExperience: { seen: 1 },
    })
  })
})
