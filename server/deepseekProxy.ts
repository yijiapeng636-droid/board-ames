import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

const MAX_BODY_BYTES = 100_000
const UPSTREAM_TIMEOUT_MS = 8_000
const MAX_AGENT_MESSAGES = 32
const MAX_AGENT_TOOLS = 8

interface ProxyOptions {
  apiKey?: string
  baseUrl?: string
  model?: string
}

interface AgentToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: AgentToolCall[]
  tool_call_id?: string
}

interface AgentTool {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export function buildAgentUpstreamBody(
  model: string,
  request: ReturnType<typeof parseAgentPayload>,
) {
  return {
    model,
    messages: request.messages,
    response_format: { type: 'json_object' },
    ...(request.finalJsonOnly
      ? { tool_choice: 'none' }
      : { tools: request.tools ?? [], tool_choice: 'auto' }),
    thinking: { type: 'disabled' },
    temperature: 0.2,
    max_tokens: 700,
    stream: false,
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body))
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new Error('请求内容过大')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

function completionEndpoint(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, '')
  return normalized.endsWith('/chat/completions') ? normalized : `${normalized}/chat/completions`
}

export function parseAgentPayload(payload: unknown): {
  messages: AgentMessage[]
  tools?: AgentTool[]
  finalJsonOnly: boolean
} {
  if (!payload || typeof payload !== 'object') throw new Error('Agent 请求必须是对象')
  const value = payload as Record<string, unknown>
  if (
    !Array.isArray(value.messages) ||
    value.messages.length === 0 ||
    value.messages.length > MAX_AGENT_MESSAGES
  ) {
    throw new Error(`Agent messages 数量必须为 1-${MAX_AGENT_MESSAGES}`)
  }
  if (
    value.tools !== undefined &&
    (!Array.isArray(value.tools) || value.tools.length > MAX_AGENT_TOOLS)
  ) {
    throw new Error(`Agent tools 数量不能超过 ${MAX_AGENT_TOOLS}`)
  }
  const messages = value.messages.map((message): AgentMessage => {
    if (!message || typeof message !== 'object') throw new Error('Agent message 格式无效')
    const item = message as Record<string, unknown>
    if (!['system', 'user', 'assistant', 'tool'].includes(String(item.role)))
      throw new Error('Agent message role 无效')
    if (item.content !== null && typeof item.content !== 'string')
      throw new Error('Agent message content 无效')
    const normalized: AgentMessage = {
      role: item.role as AgentMessage['role'],
      content: item.content as string | null,
    }
    if (item.role === 'tool') {
      if (typeof item.tool_call_id !== 'string') throw new Error('Tool message 缺少 tool_call_id')
      normalized.tool_call_id = item.tool_call_id
    }
    if (item.tool_calls !== undefined) {
      if (item.role !== 'assistant' || !Array.isArray(item.tool_calls))
        throw new Error('tool_calls 只能出现在 assistant message')
      normalized.tool_calls = item.tool_calls.map((call): AgentToolCall => {
        if (!call || typeof call !== 'object') throw new Error('tool_call 格式无效')
        const raw = call as Record<string, unknown>
        const fn = raw.function as Record<string, unknown> | undefined
        if (
          typeof raw.id !== 'string' ||
          raw.type !== 'function' ||
          typeof fn?.name !== 'string' ||
          typeof fn.arguments !== 'string'
        )
          throw new Error('tool_call 字段无效')
        return {
          id: raw.id,
          type: 'function',
          function: { name: fn.name, arguments: fn.arguments },
        }
      })
    }
    return normalized
  })
  if (value.finalJsonOnly !== undefined && typeof value.finalJsonOnly !== 'boolean')
    throw new Error('finalJsonOnly must be boolean')
  const tools = (value.tools as unknown[] | undefined)?.map((tool): AgentTool => {
    if (!tool || typeof tool !== 'object') throw new Error('Agent tool 格式无效')
    const raw = tool as Record<string, unknown>
    const fn = raw.function as Record<string, unknown> | undefined
    if (
      raw.type !== 'function' ||
      typeof fn?.name !== 'string' ||
      typeof fn.description !== 'string' ||
      !fn.parameters ||
      typeof fn.parameters !== 'object' ||
      Array.isArray(fn.parameters)
    )
      throw new Error('Agent tool 字段无效')
    return {
      type: 'function',
      function: {
        name: fn.name,
        description: fn.description,
        parameters: fn.parameters as Record<string, unknown>,
      },
    }
  })
  return { messages, ...(tools ? { tools } : {}), finalJsonOnly: value.finalJsonOnly === true }
}

async function forwardAgent(
  response: ServerResponse,
  options: Required<ProxyOptions>,
  payload: unknown,
) {
  const request = parseAgentPayload(payload)
  const upstream = await fetch(completionEndpoint(options.baseUrl), {
    method: 'POST',
    headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildAgentUpstreamBody(options.model, request)),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  })
  if (!upstream.ok) {
    sendJson(response, 502, { error: `DeepSeek Agent 请求失败（HTTP ${upstream.status}）` })
    return
  }
  const completion = (await upstream.json()) as {
    choices?: Array<{
      finish_reason?: unknown
      message?: { content?: unknown; tool_calls?: unknown }
    }>
  }
  const choice = completion.choices?.[0]
  const rawMessage = choice?.message
  if (!rawMessage || (rawMessage.content !== null && typeof rawMessage.content !== 'string'))
    throw new Error('DeepSeek Agent 未返回有效消息')
  const normalized = parseAgentPayload({
    messages: [
      {
        role: 'assistant',
        content: rawMessage.content ?? null,
        ...(rawMessage.tool_calls ? { tool_calls: rawMessage.tool_calls } : {}),
      },
    ],
    tools: [],
    finalJsonOnly: false,
  }).messages[0]
  sendJson(response, 200, {
    message: normalized,
    finishReason: typeof choice?.finish_reason === 'string' ? choice.finish_reason : null,
  })
}

function buildMessages(payload: unknown) {
  const request = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const retry = typeof request.retryReason === 'string' ? request.retryReason : ''
  const retryInstruction = retry
    ? `\n上一次落点未通过本地校验，原因：${retry}。请避开该问题并重新选择。`
    : ''

  return [
    {
      role: 'system',
      content:
        '你是五子棋策略决策者，执棋颜色由 game.aiPlayer 指定。本地 TypeScript 引擎已完成规则检查、多步搜索和 Alpha-Beta 剪枝。请综合 game.searchedCandidates 中的 searchScore、staticScore、features、principalVariation，以及仅作弱参考的 sessionExperience。不得无理由忽略明显强制战术，只能选择 searchedCandidates 中的坐标。只输出 JSON，不要输出 Markdown。JSON 格式示例：{"row":7,"col":8,"reason":"简短说明"}。',
    },
    {
      role: 'user',
      content: `当前棋局 JSON：${JSON.stringify(request.game ?? null)}${retryInstruction}`,
    },
  ]
}

function buildReviewMessages(payload: unknown) {
  return [
    {
      role: 'system',
      content:
        '你是五子棋教练。只能解释本地 reviewPoints 中的 classification、evidence、tacticalFacts、分数与PV，不得自行发明棋形或关键回合。keyMoments.moveNumber 只能来自 reviewPoints 且不得重复。坐标由UI结构化展示，title/explanation/suggestion 中不要重述任何数字坐标。只输出 JSON，结构为：{"summary":"总评","keyMoments":[{"moveNumber":1,"title":"标题","explanation":"解释","suggestion":"建议"}],"strengths":["优点"],"recurringIssues":["问题标签"],"practiceSuggestions":["练习建议"]}。',
    },
    { role: 'user', content: `棋局与本地分析 JSON：${JSON.stringify(payload)}` },
  ]
}

function buildAnomalyReviewMessages(payload: unknown) {
  return [
    {
      role: 'system',
      content:
        '你是五子棋棋局异常复盘 Agent。输入中的 anomalies 可能包含运行异常，也可能包含本地确定性 Postmortem 检出的棋力异常。必须把 evidence、positionKey、selectedMove、recommendedMove 和 aiDiagnostics 视为事实，不得推翻本地结论、发明棋形、坐标或根因。优先提炼可复用的决策教训，并区分 Agent 选择问题与本地搜索/威胁模型问题。anomalyIds 只能引用输入的异常 ID。只输出 JSON：{"summary":"摘要","anomalyIds":["id"],"lessons":["教训"],"followUps":["后续建议"]}。',
    },
    { role: 'user', content: `棋局异常 JSON：${JSON.stringify(payload)}` },
  ]
}

function buildXiangqiMoveMessages(payload: unknown) {
  return [
    {
      role: 'system',
      content:
        '你是中国象棋训练助手。本地规则引擎已完成合法性、将军、终局、重复棋例和搜索。只能从 searchedCandidates 选择一项，禁止创造落点或改写本地裁决。reason 必须使用简体中文，禁止输出英文解释。只输出JSON：{"from":{"row":0,"col":0},"to":{"row":0,"col":0},"reason":"简短中文说明"}。',
    },
    { role: 'user', content: `当前象棋局面JSON：${JSON.stringify(payload)}` },
  ]
}

function buildXiangqiReviewMessages(payload: unknown) {
  return [
    {
      role: 'system',
      content:
        '你是中国象棋教练。只能依据本地规则事实和搜索结果生成教学总结，不得改变合法性、胜负或棋例裁决。只输出JSON：{"summary":"总评","suggestions":["建议"]}。',
    },
    { role: 'user', content: `象棋复盘JSON：${JSON.stringify(payload)}` },
  ]
}

async function forwardCompletion(
  response: ServerResponse,
  options: Required<ProxyOptions>,
  messages: ReturnType<typeof buildMessages>,
  maxTokens: number,
) {
  const upstream = await fetch(completionEndpoint(options.baseUrl), {
    method: 'POST',
    headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: options.model,
      messages,
      thinking: { type: 'disabled' },
      response_format: { type: 'json_object' },
      max_tokens: maxTokens,
      stream: false,
    }),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  })
  if (!upstream.ok) {
    sendJson(response, 502, { error: `DeepSeek 请求失败（HTTP ${upstream.status}）` })
    return
  }
  const completion = (await upstream.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>
  }
  const content = completion.choices?.[0]?.message?.content
  if (typeof content !== 'string' || content.trim() === '')
    throw new Error('DeepSeek 未返回有效内容')
  sendJson(response, 200, JSON.parse(content) as unknown)
}

export function deepseekProxy(options: ProxyOptions): Plugin {
  return {
    name: 'local-deepseek-proxy',
    configureServer(server) {
      server.middlewares.use('/api/gomoku/agent', async (request, response) => {
        if (request.method !== 'POST') {
          sendJson(response, 405, { error: '仅支持 POST 请求' })
          return
        }
        if (!options.apiKey || !options.baseUrl || !options.model) {
          sendJson(response, 503, { error: 'DeepSeek 本地配置不完整，请检查 .env.local' })
          return
        }
        try {
          await forwardAgent(response, options as Required<ProxyOptions>, await readJson(request))
        } catch (error) {
          const message = error instanceof Error ? error.message : 'DeepSeek Agent 代理发生未知错误'
          const modelTimeout = error instanceof DOMException && error.name === 'TimeoutError'
          sendJson(response, 502, {
            error: modelTimeout
              ? 'DeepSeek Agent 单次请求超时'
              : message.includes(options.apiKey)
                ? 'DeepSeek Agent 代理请求失败'
                : message,
            code: modelTimeout ? 'model_timeout' : 'model_request_failed',
          })
        }
      })
      server.middlewares.use('/api/gomoku/review', async (request, response) => {
        if (request.method !== 'POST') {
          sendJson(response, 405, { error: '仅支持 POST 请求' })
          return
        }
        if (!options.apiKey || !options.baseUrl || !options.model) {
          sendJson(response, 503, { error: 'DeepSeek 本地配置不完整，请检查 .env.local' })
          return
        }
        try {
          const payload = await readJson(request)
          await forwardCompletion(
            response,
            options as Required<ProxyOptions>,
            buildReviewMessages(payload),
            1200,
          )
        } catch (error) {
          const message = error instanceof Error ? error.message : 'DeepSeek 复盘代理发生未知错误'
          sendJson(response, 502, {
            error: message.includes(options.apiKey) ? 'DeepSeek 复盘代理请求失败' : message,
          })
        }
      })
      server.middlewares.use('/api/gomoku/anomaly-review', async (request, response) => {
        if (request.method !== 'POST') {
          sendJson(response, 405, { error: '仅支持 POST 请求' })
          return
        }
        if (!options.apiKey || !options.baseUrl || !options.model) {
          sendJson(response, 503, { error: 'DeepSeek 本地配置不完整，请检查 .env.local' })
          return
        }
        try {
          await forwardCompletion(
            response,
            options as Required<ProxyOptions>,
            buildAnomalyReviewMessages(await readJson(request)),
            900,
          )
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'DeepSeek 异常复盘代理发生未知错误'
          sendJson(response, 502, {
            error: message.includes(options.apiKey) ? 'DeepSeek 异常复盘代理请求失败' : message,
          })
        }
      })
      server.middlewares.use('/api/gomoku/move', async (request, response) => {
        if (request.method !== 'POST') {
          sendJson(response, 405, { error: '仅支持 POST 请求' })
          return
        }
        if (!options.apiKey || !options.baseUrl || !options.model) {
          sendJson(response, 503, { error: 'DeepSeek 本地配置不完整，请检查 .env.local' })
          return
        }

        try {
          const payload = await readJson(request)
          const upstream = await fetch(completionEndpoint(options.baseUrl), {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${options.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: options.model,
              messages: buildMessages(payload),
              thinking: { type: 'disabled' },
              response_format: { type: 'json_object' },
              max_tokens: 512,
              stream: false,
            }),
            signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
          })

          if (!upstream.ok) {
            sendJson(response, 502, { error: `DeepSeek 请求失败（HTTP ${upstream.status}）` })
            return
          }

          const completion = (await upstream.json()) as {
            choices?: Array<{ message?: { content?: unknown } }>
          }
          const content = completion.choices?.[0]?.message?.content
          if (typeof content !== 'string' || content.trim() === '') {
            throw new Error('DeepSeek 未返回有效内容')
          }
          sendJson(response, 200, JSON.parse(content) as unknown)
        } catch (error) {
          const message = error instanceof Error ? error.message : 'DeepSeek 代理发生未知错误'
          const safeMessage = message.includes(options.apiKey) ? 'DeepSeek 代理请求失败' : message
          sendJson(response, 502, { error: safeMessage })
        }
      })
      server.middlewares.use('/api/xiangqi/move', async (request, response) => {
        if (request.method !== 'POST') {
          sendJson(response, 405, { error: '仅支持 POST 请求' })
          return
        }
        if (!options.apiKey || !options.baseUrl || !options.model) {
          sendJson(response, 503, { error: 'DeepSeek 本地配置不完整，请检查 .env.local' })
          return
        }
        try {
          await forwardCompletion(
            response,
            options as Required<ProxyOptions>,
            buildXiangqiMoveMessages(await readJson(request)),
            512,
          )
        } catch (error) {
          const message = error instanceof Error ? error.message : 'DeepSeek 象棋代理发生未知错误'
          sendJson(response, 502, {
            error: message.includes(options.apiKey) ? 'DeepSeek 象棋代理请求失败' : message,
          })
        }
      })
      server.middlewares.use('/api/xiangqi/review', async (request, response) => {
        if (request.method !== 'POST') {
          sendJson(response, 405, { error: '仅支持 POST 请求' })
          return
        }
        if (!options.apiKey || !options.baseUrl || !options.model) {
          sendJson(response, 503, { error: 'DeepSeek 本地配置不完整，请检查 .env.local' })
          return
        }
        try {
          await forwardCompletion(
            response,
            options as Required<ProxyOptions>,
            buildXiangqiReviewMessages(await readJson(request)),
            1000,
          )
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'DeepSeek 象棋复盘代理发生未知错误'
          sendJson(response, 502, {
            error: message.includes(options.apiKey) ? 'DeepSeek 象棋复盘代理请求失败' : message,
          })
        }
      })
    },
  }
}
