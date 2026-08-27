import { describe, expect, it } from 'vitest'
import { XIANGQI_2020_COVERAGE } from '@/games/xiangqi/rules/sources'
import { CHAPTER_08_OFFICIAL_CASES } from '@/games/xiangqi/tests/official-cases/fixtures/chapter08'
import { CHAPTER_09_OFFICIAL_CASES } from '@/games/xiangqi/tests/official-cases/fixtures/chapter09'
import {
  assertOfficialCoverageIntegrity,
  deriveOfficialCoverage,
  formatOfficialCoverage,
  runOfficialCase,
  validateOfficialCase,
} from '@/games/xiangqi/tests/official-cases/runner'

const officialCases = [...CHAPTER_08_OFFICIAL_CASES, ...CHAPTER_09_OFFICIAL_CASES]

describe('Xiangqi 2020 official case fixtures', () => {
  const results = officialCases.map((officialCase) => ({
    officialCase,
    run: () => runOfficialCase(officialCase),
  }))

  it('validates fixture structure, notation, legal replay and cycle position keys', () => {
    for (const officialCase of officialCases) expect(validateOfficialCase(officialCase)).toBe(true)
  })

  it('keeps fixture coverageIds and source requiredCaseIds bidirectionally consistent', () => {
    expect(assertOfficialCoverageIntegrity(XIANGQI_2020_COVERAGE, officialCases)).toBe(true)
  })

  for (const item of results) {
    it(`${item.officialCase.id} ${item.officialCase.title}`, () => {
      expect(item.run()).toMatchObject({ caseId: item.officialCase.id, passed: true })
    })
  }

  it('derives the coverage matrix from executable fixtures instead of manual passed flags', () => {
    const executed = results.map((item) => item.run())
    const matrix = deriveOfficialCoverage(XIANGQI_2020_COVERAGE, officialCases, executed)
    expect(matrix.find((entry) => entry.id === 'long-check')?.status).toBe('passed')
    expect(matrix.find((entry) => entry.id === 'long-kill')?.status).toBe('passed')
    expect(matrix.find((entry) => entry.id === 'both-allowed')?.status).toBe('passed')
    expect(matrix.find((entry) => entry.id === 'chase-rook')?.status).toBe('passed')
    expect(matrix.find((entry) => entry.id === 'chase-unprotected')?.status).toBe('passed')
    expect(matrix.find((entry) => entry.id === 'check-chase')?.status).toBe('passed')
    expect(matrix.find((entry) => entry.id === 'pawn-general')?.status).toBe('partial')
    expect(formatOfficialCoverage(matrix)).toContain('long-check')
  })
})
