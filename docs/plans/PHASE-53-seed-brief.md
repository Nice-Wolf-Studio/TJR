# Phase 53 Seed Brief: Real Provider Integration & Output Enhancement

**Date**: 2025-10-03
**Author**: Development Team
**Status**: Draft

---

## Executive Summary

Phase 53 focuses on making the TJR app production-ready by integrating real market data providers (Polygon.io), enhancing analysis output with Break of Structure (BOS) detection, and establishing Discord bot integration for live market analysis delivery.

---

## Problem Statement

### Current State

- ✅ App runs successfully with fixture data
- ✅ Analysis shows bias, trend, session extremes, day profile
- ✅ Provider infrastructure exists (Polygon, Databento, Yahoo packages)
- ❌ App hardcoded to use fixtures only - no real provider integration
- ❌ BOS (Break of Structure) not displayed in output
- ❌ Discord bot is a stub - not connected to real Discord
- ❌ No provider fallback/composite policy

### Desired State

- ✅ App fetches real market data from Polygon.io
- ✅ Provider fallback chain (Databento → Polygon → Yahoo)
- ✅ BOS detection integrated into daily analysis output
- ✅ Discord bot posts analysis to configured channels
- ✅ Complete end-to-end workflow: real data → analysis → Discord delivery

### Gap Analysis

**Missing:**
1. Real provider wiring in app/src/start.ts (currently hardcoded to FixtureProvider)
2. Provider composite policy implementation
3. BOS formatter integration
4. Discord bot real API integration
5. Configuration for provider selection

---

## Objectives

### Primary Objectives

1. **Real Provider Integration**
   - **Why**: Enable production use with live market data
   - **How**: Wire Polygon provider in app, add provider selection logic
   - **Success Metric**: App successfully fetches SPY data from Polygon.io API

2. **Provider Composite Policy**
   - **Why**: Reliability through fallback chain
   - **How**: Implement composite provider with retry logic
   - **Success Metric**: App falls back to secondary provider when primary fails

3. **BOS Output Enhancement**
   - **Why**: Complete technical analysis output
   - **How**: Add BOS detection from analysis-kit to daily command formatter
   - **Success Metric**: Daily output shows identified Break of Structure levels

4. **Discord Bot Integration**
   - **Why**: Deliver analysis to Discord channels
   - **How**: Replace Discord stub with real discord.js implementation
   - **Success Metric**: Bot successfully posts analysis to configured channel

### Secondary Objectives

- Real-time data streaming (websocket support)
- Multiple timeframe analysis in single command
- Historical analysis with date range

---

## Scope

### In Scope

- [ ] Wire Polygon provider in app/src/start.ts
- [ ] Implement provider composite with fallback chain
- [ ] Add BOS detection to daily command output
- [ ] Implement real Discord bot (replace stub)
- [ ] Add provider selection configuration
- [ ] Health check for provider connectivity
- [ ] Error handling for rate limits and API failures

### Out of Scope

- ❌ Web dashboard UI (future phase)
- ❌ Real-time streaming (deferred to Phase 54)
- ❌ Advanced caching strategies (deferred)
- ❌ Multi-symbol batch analysis (future consideration)

---

## Technical Approach

### Architecture

```
┌─────────────────┐
│  Discord Bot    │ ─────> Posts analysis
└────────┬────────┘
         │
         v
┌─────────────────┐
│  Daily Command  │ ─────> Formats output (+ BOS)
└────────┬────────┘
         │
         v
┌─────────────────┐
│ Analysis Kit    │ ─────> Structure, Bias, BOS
└────────┬────────┘
         │
         v
┌─────────────────────────────────────┐
│       Provider Composite            │
│  ┌──────────┐  ┌─────────┐  ┌─────┐│
│  │ Databento│─>│ Polygon │─>│Yahoo││ (Fallback chain)
│  └──────────┘  └─────────┘  └─────┘│
└─────────────────────────────────────┘
         │
         v
   [Real Market Data]
```

### Key Technologies

- **Polygon.io SDK**: Already in @tjr/provider-polygon package
- **discord.js**: For Discord bot integration
- **Analysis Kit**: BOS detection via structure analysis

### Integration Points

- **app/src/start.ts**: Provider factory based on PROVIDER_TYPE env var
- **app/src/services/providers**: Composite provider implementation
- **app/src/commands/daily.ts**: BOS formatter integration
- **app/src/services/discord**: Real Discord client (replace stub)

---

## Deliverables

### Must-Have

1. **Provider Integration**
   - Description: App uses real Polygon provider when PROVIDER_TYPE=polygon
   - Acceptance Criteria:
     - [ ] Polygon provider instantiated from config
     - [ ] Real API calls successful
     - [ ] Data flows to analysis correctly

2. **Provider Composite**
   - Description: Fallback chain with retry logic
   - Acceptance Criteria:
     - [ ] Databento → Polygon → Yahoo fallback order
     - [ ] Retries on transient failures
     - [ ] Logs provider selection decisions

3. **BOS Output**
   - Description: Break of Structure displayed in daily analysis
   - Acceptance Criteria:
     - [ ] BOS levels identified and formatted
     - [ ] Bullish/bearish BOS distinguished
     - [ ] Integrated into existing output format

4. **Discord Bot**
   - Description: Real Discord bot posts analysis
   - Acceptance Criteria:
     - [ ] Connects to Discord API
     - [ ] Responds to /daily command
     - [ ] Posts formatted analysis to channel
     - [ ] Handles errors gracefully

### Nice-to-Have

1. **Provider health dashboard** - CLI command showing provider status
2. **Retry backoff configuration** - Configurable retry delays
3. **Multiple Discord channels** - Post to dev/staging/prod channels

---

## Dependencies

### Prerequisites

- [x] Phase 52 complete (provider packages exist)
- [x] Polygon API key available (.env configured)
- [x] Discord bot token available (.env configured)
- [x] Analysis-kit has BOS detection (structure analysis)

### Dependent Work

- Phase 54 (real-time streaming) depends on provider composite
- Phase 55 (web dashboard) depends on Discord bot patterns

---

## Risks & Mitigation

### High Risk ⚠️

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Polygon API rate limits exceeded | App unusable | Medium | Implement caching, use composite fallback |
| Discord bot token leaked | Security breach | Low | Use .env, add to .gitignore, secret scanning |

### Medium Risk

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Provider API changes | Data fetch fails | Low | Version pinning, integration tests |
| BOS detection accuracy | Incorrect analysis | Medium | Validate with fixtures, backtesting |

---

## Timeline

### Estimated Effort

- **Research & ADRs**: 0.5 days (provider composite policy)
- **Implementation**: 3 days
  - Provider wiring: 0.5 days
  - Composite implementation: 1 day
  - BOS formatting: 0.5 day
  - Discord bot: 1 day
- **Testing & QA**: 1 day
- **Documentation**: 0.5 days
- **Total**: 5 days

### Milestones

| Milestone | Target Date | Dependencies |
|-----------|-------------|--------------|
| ADR complete | Day 1 | - |
| Polygon integration | Day 2 | ADR |
| Composite provider | Day 3 | Polygon integration |
| BOS + Discord | Day 4 | Composite |
| Phase closeout | Day 5 | All shards |

---

## Success Criteria

### Definition of Done

- [ ] App fetches real data from Polygon.io
- [ ] Composite provider with fallback works
- [ ] BOS levels shown in daily output
- [ ] Discord bot posts analysis successfully
- [ ] All tests passing
- [ ] Documentation complete (ADR, journal, README)
- [ ] .env.example updated with new vars
- [ ] No secrets committed

### Key Metrics

- **Provider uptime**: >99% (with fallback)
- **Analysis latency**: <5 seconds end-to-end
- **Discord delivery**: <2 seconds from command

---

## Team & Resources

### Team Members

- **Phase Lead**: Development Team
- **Developers**: Primary developer
- **QA**: Automated tests + manual verification

### Required Resources

- [x] Polygon.io API key (already configured)
- [x] Discord bot token (already configured)
- [x] Test Discord server

---

## Communication Plan

### Stakeholders

- **Primary**: Project owner
- **Secondary**: End users (Discord community)

### Updates

- **Progress**: Via journal fragments
- **Completion**: Phase closeout report

---

## Approval

- [ ] Technical Lead approval
- [ ] Security review (Discord token handling)
- [ ] Ready to start implementation

---

## Next Steps

1. [ ] Create phase plan from template → `PHASE-53-plan.md`
2. [ ] Break down into shards (53.A1, 53.A2, etc.)
3. [ ] Create ADR for provider composite policy
4. [ ] Set up journal fragments: `docs/journal/_fragments/53/`
5. [ ] Begin Shard 53.A1 implementation

---

## References

- **Phase 52 Journal**: docs/journals/PHASE-52.md
- **Provider Packages**: packages/provider-{polygon,databento,yahoo}
- **Analysis Kit**: packages/analysis-kit
- **App Package**: packages/app
- **Wolf Agents**: CLAUDE.md integration
