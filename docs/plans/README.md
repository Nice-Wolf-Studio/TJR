# Phase Plans

This directory contains planning documents for each development phase following the Wolf Agents framework.

## Structure

```
plans/
├── PHASE-XX-plan.md      # Active and completed phase plans
├── templates/            # Planning templates
│   ├── phase-plan-template.md
│   └── seed-brief-template.md
└── archive/             # Archived/deprecated plans
```

## Phase Plan Format

Each phase plan follows the Wolf Agents Phase Lifecycle:

1. **Seed Brief** - Phase objectives and context
2. **Pre-Phase Sweeps** - Meta + Governance setup
3. **Shard Breakdown** - Individual work items with:
   - Intake → Research/ADR → Implementation → Review → Merge
4. **Close-Out Sweeps** - Meta + Governance validation

## Current Phases

- **Phase 51**: Monorepo bootstrap and foundation packages ✅ Complete
- **Phase 52**: Provider infrastructure and build stabilization ✅ Complete
- **Phase 53**: TBD (In planning)

## Usage

### Starting a New Phase

1. Copy `templates/phase-plan-template.md` to `PHASE-XX-plan.md`
2. Fill out seed brief with objectives
3. Break down into shards
4. Create ADRs for architectural decisions
5. Track progress with journal fragments
6. Consolidate journal at closeout
7. Create closeout reports

### Completing a Phase

1. Consolidate journal fragments → `docs/journals/PHASE-XX.md`
2. Create meta closeout report → `docs/reports/phase-XX-meta-closeout.md`
3. Create governance closeout report → `docs/reports/phase-XX-governance-closeout.md`
4. Tag release: `phase-XX-complete` and `vXX.0.0`
5. Archive plan if needed → `archive/PHASE-XX-plan.md`

## Wolf Agents Alignment

All plans follow Wolf Ethos principles:

- **Evidence first; opinions last** - Decisions based on data
- **Smallest viable, reversible change** - Incremental progress
- **Additive before destructive** - Shims and flags over breaking changes
- **Boring-by-default tech** - Proven solutions unless novelty reduces risk
- **Readability/operability are features** - Maintainable, debuggable code

## References

- [Wolf Agents Framework](https://github.com/Nice-Wolf-Studio/WolfAgents)
- [CLAUDE.md](../../CLAUDE.md) - Claude Code guidance with Wolf Agents integration
- [ADRs](../adr/) - Architectural Decision Records
- [Journals](../journals/) - Consolidated implementation journals
- [Reports](../reports/) - Phase closeout reports
