st# Phase 53: TJR Tooling Enforcement Architecture

**Date:** 2025-10-05
**Component:** Architecture Design
**Status:** Design Complete ✅

## Summary

Designed comprehensive enforcement mechanism to ensure LLM-based Discord bot MUST use TJR analytical tools when providing market analysis, preventing bypass through pure LLM reasoning.

## Deliverables Created

### 1. Strategy Status Template
**File:** `docs/templates/STRATEGY_STATUS_RESPONSE.md`

Reusable template showing:
- Current implementation: 18% complete
- Implemented components (market data, foundation packages, infrastructure)
- Missing components (82% - FVG detection, SMT, execution logic, etc.)
- Prioritized roadmap with 6 phases over 22-32 weeks
- Success metrics for each phase
- File structure mapping

### 2. Enforcement Architecture ADR
**File:** `docs/adr/ADR-0320-enforce-tjr-tooling.md`

Multi-layer enforcement design:
1. **Tool Call Validation Layer** - Validates required tools are called
2. **Response Schema Enforcement** - Structured output with tool evidence
3. **Prompt Engineering Guards** - System prompts mandating tool usage

Key components:
- `ToolEnforcer` - Orchestrates required tool execution
- `ResponseValidator` - Ensures output includes tool attribution
- `TJRCommandWrapper` - Intercepts and processes analysis requests
- `AnalysisHandler` - Discord bot integration with tool embeds

## Architecture Highlights

### Enforcement Flow
```
Discord Request → Request Router → Tool Enforcement Layer
→ TJR Tool Orchestrator → Response Validator
→ LLM Formatter (constrained) → Discord Response
```

### Required Tools by Request Type
- **Market Analysis:** session_levels, premium_discount, order_flow, daily_bias
- **Trade Setup:** All above + fvg_detector, smt_analyzer, bos_detector, liquidity_sweep
- **Bias Check:** daily_bias, trend_phase, premium_discount

### Validation Points
1. Pre-execution: Required tools identified
2. During execution: Tools run in dependency order
3. Post-execution: All tools returned data
4. Response building: Tool evidence included
5. Final validation: Schema compliance checked

## Implementation Strategy

### Phase 1: Core Enforcement (Week 1)
- Implement ToolEnforcer class
- Create tool dependency graph
- Add execution validation

### Phase 2: Response Schema (Week 1-2)
- Define TJRAnalysisResponse interface
- Implement ResponseValidator
- Add schema enforcement

### Phase 3: Command Integration (Week 2)
- Create TJRCommandWrapper
- Integrate with existing /daily command
- Add error handling

### Phase 4: Discord Bot (Week 2-3)
- Implement AnalysisHandler
- Add tool attribution embeds
- Update message handlers

### Phase 5: Testing (Week 3)
- Unit tests for validators
- Integration tests for pipeline
- Performance profiling

## Technical Decisions

### Strict Enforcement
- **Decision:** Make tool usage mandatory, not optional
- **Rationale:** Ensures consistency and quality
- **Trade-off:** Less flexibility, but guaranteed methodology adherence

### Multi-Layer Validation
- **Decision:** Validate at request, execution, and response levels
- **Rationale:** Defense in depth against bypasses
- **Impact:** Multiple checkpoints catch different failure modes

### Tool Attribution
- **Decision:** Require explicit tool source for every data point
- **Rationale:** Full auditability and transparency
- **Implementation:** Source field in all analysis components

### Constrained LLM
- **Decision:** LLM only formats, doesn't analyze
- **Rationale:** Prevents hallucination and ensures determinism
- **Method:** System prompts forbid analysis beyond tool outputs

## Success Metrics

1. **Tool Usage Rate:** 100% of analyses use required tools
2. **Validation Pass Rate:** >95% pass schema validation
3. **Latency Impact:** <500ms added for tool execution
4. **Audit Coverage:** 100% of recommendations traceable
5. **User Satisfaction:** No degradation in quality scores

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Tool timeout | 5-second timeout with cache fallback |
| Over-restriction | Admin override mechanism |
| LLM bypass attempts | Multiple validation layers |
| Performance impact | Parallel execution, result caching |

## Integration Points

### Existing Systems
- `/daily` command in `packages/app/src/commands/`
- Discord MCP in `packages/discord-mcp/`
- Analysis kit in `packages/analysis-kit/`
- Strategy components in `packages/strategy/`

### New Components Needed
- `packages/app/src/middleware/tool-enforcer.ts`
- `packages/app/src/validators/response-schema.ts`
- `packages/app/src/commands/tjr-command-wrapper.ts`
- `packages/discord-mcp/src/analysis-handler.ts`

## Next Steps

1. **Implement FVG Detector** - Critical for trade setups
2. **Build Tool Enforcer** - Core validation logic
3. **Update Discord Bot** - Add enforcement pipeline
4. **Create Integration Tests** - Validate full flow
5. **Deploy to Staging** - Test with real Discord messages

## Lessons Learned

### Design Insight
Building tools without enforcement is like building a library nobody visits. The enforcement layer ensures our analytical tools provide value by making them mandatory for analysis.

### Architecture Pattern
The multi-layer validation approach (request → execution → response) provides defense in depth while maintaining clear separation of concerns.

### User Experience
Tool attribution in responses builds trust by showing users exactly which algorithms produced the analysis, similar to citations in academic work.

## Wolf Ethos Alignment

- ✅ **Evidence First:** Tool outputs provide deterministic evidence
- ✅ **Smallest Viable:** Each enforcement layer independently testable
- ✅ **Additive:** Builds on existing commands without breaking them
- ✅ **Boring Tech:** Standard validation patterns, no novel frameworks
- ✅ **Operability:** Full audit trail for every analysis

---

**Effort:** 4 hours design and documentation
**Quality:** Production-ready architecture with clear implementation path