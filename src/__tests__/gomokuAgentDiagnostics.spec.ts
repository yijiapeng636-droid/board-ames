import { describe, expect, it } from 'vitest'
import type { AgentTrace } from '@/ai/runtime/agentTypes'
import { describeGomokuAgentFailure } from '@/games/gomoku/ai/strategy/agentDiagnostics'

function trace(failure: AgentTrace['failure']): AgentTrace {
  return {
    startedAt: 1,
    completedAt: 2,
    modelCalls: [],
    toolCalls: [],
    totalDurationMs: 1,
    finalStatus: 'fallback',
    fallbackReason: 'model_timeout',
    failure,
    directFinal: false,
  }
}

describe('Gomoku Agent failure diagnostics', () => {
  it('shows the exact model call and failure stage', () => {
    const result = describeGomokuAgentFailure(
      'model_timeout',
      trace({ stage: 'model_request', modelCall: 2 }),
    )
    expect(result).toMatchObject({ stage: 'model_request', modelCall: 2 })
    expect(result.message).toContain('DeepSeek 模型请求')
    expect(result.message).toContain('第 2 次模型调用')
    expect(result.message).toContain('超过 8 秒')
  })

  it('shows the exact tool and tactical gate failures', () => {
    const tool = describeGomokuAgentFailure(
      'tool_execution_failed',
      trace({ stage: 'tool_execution', modelCall: 1, toolName: 'compare_candidates' }),
    )
    expect(tool.message).toContain('工具 compare_candidates')
    expect(tool.message).toContain('本地搜索工具执行异常')
    expect(describeGomokuAgentFailure('mandatory_defense_violation').stageLabel).toBe(
      '本地战术门禁',
    )
  })
})
