# Change: Stabilize the Gomoku Runtime Agent

## Why
The Gomoku strategy agent can exhaust its model-call budget before producing a final decision, shares an 8-second ceiling with a single upstream request, spends a mandatory round on deterministic inspection, and collapses distinct failures into an opaque fallback.

## What Changes
- Give model calls, tool calls, and the total lifecycle independent budgets and reserve the final model call.
- Precompute AI-relative position inspection and expose only three bounded search tools.
- Use one strict final envelope with tolerant explanatory metadata and a deterministic tactical gate.
- Add typed fallback reasons, lifecycle traces, turn metrics, and development diagnostics.
- Distinguish tool rounds from JSON-only final rounds in the proxy.

## Scope
Only the Gomoku Runtime Agent path is changed. Xiangqi, Gomoku evaluation weights, threat-search strategy, dependencies, and unrelated UI remain unchanged.
