# Gomoku AI V3 Round-one Fixes

## ADDED Requirements

### Requirement: Fixed candidate continuation
The system MUST analyze a requested candidate by fixing that root move and continuing the shared Alpha-Beta search from the opponent turn without root tactical shortcuts.

#### Scenario: Mandatory reply continues
- **WHEN** the fixed move creates a unique mandatory block
- **THEN** the PV starts with the fixed move, includes the block, and continues with the original root player's next move when the completed depth permits

### Requirement: Tool evidence authenticity
Strategy Tools MUST return score, PV, depth and forced status produced by the current fixed analysis, and MUST label any baseline evidence separately.

#### Scenario: Deep result differs from baseline
- **WHEN** a fixed deep result differs from baseline
- **THEN** the Tool returns the deep result as its primary result

### Requirement: Move-specific threat proof
The system MUST prove a requested first move independently and MUST distinguish a proven win from timeout or an unproved line.

#### Scenario: Multiple winning entrances
- **WHEN** two different root moves are forced wins
- **THEN** requesting either move can independently return proven_win

### Requirement: Controlled strategy candidates
The system MUST include protected tactical and forcing candidates beyond the final baseline list while keeping a finite candidate boundary shared by Tools and the final Validator.

#### Scenario: Forcing move outside baseline top list
- **WHEN** a forcing candidate is outside the baseline final list
- **THEN** it remains available for Tool analysis and validated Agent selection

### Requirement: Side-aware tactical evaluation
Leaf evaluation MUST consider sideToMove and MUST derive multi-threat from multiple threats created by the same legal move rather than unrelated structures across the board.

#### Scenario: Broken tactical shape
- **WHEN** a legal gap-filling move completes a five or forcing four
- **THEN** leaf tactical inspection reports that concrete move and evaluation reflects the side that can play it

### Requirement: Locally grounded review
Review mistakes MUST compare actual and recommended moves with the same fixed-search score semantics, MUST include the actual player, and MUST reject or sanitize model key moments outside locally analyzed move numbers.

#### Scenario: Actual move equals recommendation
- **WHEN** local search recommends the move that was played
- **THEN** that move is not emitted as a mistake
