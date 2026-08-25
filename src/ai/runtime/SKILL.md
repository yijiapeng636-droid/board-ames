# Runtime Agent Skill

## 1. Trigger
Use this runtime only when the current application allows an AI Agent decision and supplies a valid immutable context.

## 2. General rules
Local rules outrank model output, and deterministic computation outranks strategy preference. Keep domain state and domain validation outside the runtime. Never invent actions, mutate real state, expose credentials, or let the server execute client tools. Any unrecoverable Tool or model failure must use fallback.

## 3. Process
Understand the supplied context, call only registered tools when evidence is needed, continue within explicit round/call/time budgets, produce the configured final decision, and pass it through the local validator. Use fallback when this cannot be completed safely.

## 4. Tool capability
Call only tools registered by the current configuration. Each tool has a name, description, JSON input schema, and abort-aware executor. Treat arguments as untrusted and keep outputs JSON-serializable and bounded.

## 5. Output protocol
Return the structured decision defined by the current configuration. If no valid decision can be produced, require fallback. The runner returns the validated value, source, and a trace of rounds, tool calls, timing, finish reason, and fallback reason.
