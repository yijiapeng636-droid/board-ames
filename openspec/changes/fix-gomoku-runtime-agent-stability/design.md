# Design

Local inspection, baseline search, and one frozen strategy-candidate snapshot are prepared before the model is called. Calls before the budget boundary may either return the final envelope or invoke one of three client-side tools. The last allowed model call receives no tools and is explicitly JSON-only.

The generic runner owns lifecycle timing, abort classification, budgets, tool execution, and trace construction. The Gomoku adapter owns the final envelope parser, candidate validation, baseline fallback, and user-facing development diagnostics. A deterministic tactical gate protects mandatory defense and proven local results before the existing move validator applies the move.

The server remains a transport boundary: it forwards schemas on tool rounds, enables `response_format: json_object` on final rounds, keeps its single-call timeout at eight seconds, and never executes chess logic.
