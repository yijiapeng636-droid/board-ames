# Tasks

## 1. Fixed search and threat proof
- [x] 1.1 Extract shared fixed-candidate continuation with complete-layer timeout behavior
- [x] 1.2 Add move-specific Threat Proof and explicit status
- [x] 1.3 Verify forced reply continuation, terminal moves, weak moves, and both colors

## 2. Strategy evidence
- [x] 2.1 Make search_candidate and compare_candidates return fixed-search evidence
- [x] 2.2 Build a finite protected Strategy Candidate Set
- [x] 2.3 Share the candidate boundary with Tools, Agent final validation, and game validation

## 3. Evaluation
- [x] 3.1 Add sideToMove leaf tactical inspection using the existing Candidate Analyzer
- [x] 3.2 Recognize important gap-completion tactics and same-move multi-threats
- [x] 3.3 Add false-positive and perspective regressions

## 4. Review and diagnostics
- [x] 4.1 Compare actual and recommended moves using fixed-search scores
- [x] 4.2 Add player, classification, evidence, coordinate formatting, and keyMoment sanitization
- [x] 4.3 Add bounded per-turn AI diagnostics and development-only trace copy

## 5. Regression and acceptance
- [ ] 5.1 Add available real-game snapshots without inventing missing records
- [x] 5.2 Record baseline, fixed, threat and scripted-agent performance
- [x] 5.3 Run type-check, lint, all unit tests, build, strict spec and safety audits
