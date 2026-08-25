# Gomoku Runtime Agent Stability

## ADDED Requirements

### Requirement: Reserved final model call
The runtime SHALL count each DeepSeek request as one model call and SHALL omit tools on the final allowed call.

#### Scenario: Tool use reaches the reserved call
- **WHEN** earlier model calls request tools
- **THEN** the final allowed request is JSON-only and cannot request another tool

### Requirement: Deterministic local facts
The Gomoku adapter SHALL provide AI-relative position inspection, baseline search, and one frozen strategy-candidate snapshot before model execution.

#### Scenario: Agent starts
- **WHEN** a non-forced Gomoku turn enters the strategy agent
- **THEN** deterministic inspection is already in context and `inspect_position` is not exposed

### Requirement: Typed fallback diagnostics
Every fallback SHALL have one explicit reason and the trace SHALL record model calls, tool calls, duration, and final status without secrets.

#### Scenario: Total lifecycle timeout
- **WHEN** cumulative work exceeds the total agent timeout
- **THEN** the local baseline is used with reason `agent_total_timeout`

### Requirement: Final decision safety
The adapter SHALL accept only the decision/fallback envelope, strictly validate status and move, normalize explanatory metadata, and enforce local tactical gates.

#### Scenario: Mandatory defense violation
- **WHEN** the model selects a candidate outside the frozen mandatory-defense moves
- **THEN** the selection is rejected and the local move is used with reason `mandatory_defense_violation`
