# Phase [XX]: [Phase Name]

**Status**: [Planning | In Progress | Complete]
**Start Date**: YYYY-MM-DD
**Target End Date**: YYYY-MM-DD
**Phase Lead**: [Name/Team]

---

## Seed Brief

### Objectives

[High-level goals for this phase - what are we trying to achieve?]

1. **Objective 1**: [Description]
2. **Objective 2**: [Description]
3. **Objective 3**: [Description]

### Context

[Why now? What led to this phase? What problems are we solving?]

### Success Criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

---

## Pre-Phase Sweeps

### Meta Setup

- [ ] Create phase plan document (this file)
- [ ] Set up journal fragments directory: `docs/journal/_fragments/[XX]/`
- [ ] Identify required ADRs
- [ ] Define shard breakdown

### Governance Setup

- [ ] CI/CD configured for new packages
- [ ] Code owners assigned
- [ ] Branch protection rules verified
- [ ] Review requirements defined

---

## Shard Breakdown

### Shard [XX.A1]: [Shard Name]

**Type**: [Foundation | Feature | Bug Fix | Infrastructure]
**Effort**: [Small | Medium | Large]
**Dependencies**: [None | XX.A0, XX.B1, etc.]

#### Workflow

1. **Intake** - Requirements gathering
   - [ ] Create issue with acceptance criteria
   - [ ] Define scope and constraints

2. **Research/ADR** - Architectural decisions
   - [ ] Research options and tradeoffs
   - [ ] Create ADR: `docs/adr/ADR-[XXXX]-[title].md`
   - [ ] Get feedback from team

3. **Implementation** - Build the feature
   - [ ] Create feature branch: `phase-[XX].[shard]-[description]`
   - [ ] Write code following acceptance criteria
   - [ ] Add tests (unit + integration)
   - [ ] Create journal fragment: `docs/journal/_fragments/[XX]/[XX].[shard]-[description].md`

4. **Review** - Quality validation
   - [ ] Code review (architecture, security, QA)
   - [ ] PR checks passing (build, test, lint)
   - [ ] Documentation updated

5. **Merge** - Integration
   - [ ] Merge to main
   - [ ] Update journal fragment with outcomes
   - [ ] Close related issues

#### Deliverables

- [ ] Deliverable 1
- [ ] Deliverable 2

#### Notes

[Any additional context, constraints, or considerations]

---

### Shard [XX.A2]: [Shard Name]

[Repeat structure above for each shard]

---

## Dependencies

### Prerequisites

- [ ] Dependency 1 (from Phase XX)
- [ ] Dependency 2 (external)

### Blockers

- [ ] Known blocker 1
- [ ] Known blocker 2

---

## Timeline

| Shard | Effort | Start | End | Status |
|-------|--------|-------|-----|--------|
| XX.A1 | 2d | YYYY-MM-DD | YYYY-MM-DD | ⏳ Pending |
| XX.A2 | 3d | YYYY-MM-DD | YYYY-MM-DD | ⏳ Pending |
| XX.B1 | 1d | YYYY-MM-DD | YYYY-MM-DD | ⏳ Pending |

**Total Effort**: [X days]
**Target Completion**: YYYY-MM-DD

---

## Risk Assessment

### High Risk

1. **Risk 1**: [Description]
   - **Probability**: High | Medium | Low
   - **Impact**: High | Medium | Low
   - **Mitigation**: [Strategy]

### Medium Risk

1. **Risk 2**: [Description]
   - **Mitigation**: [Strategy]

### Low Risk

1. **Risk 3**: [Description]
   - **Mitigation**: [Strategy]

---

## Close-Out Sweeps

### Meta Close-Out

- [ ] Consolidate journal fragments → `docs/journals/PHASE-[XX].md`
- [ ] Create meta closeout report → `docs/reports/phase-[XX]-meta-closeout.md`
- [ ] Document lessons learned
- [ ] Archive plan (if needed) → `docs/plans/archive/PHASE-[XX]-plan.md`

### Governance Close-Out

- [ ] All builds passing
- [ ] All tests passing
- [ ] Lint checks passing
- [ ] Code formatting applied
- [ ] Create governance closeout report → `docs/reports/phase-[XX]-governance-closeout.md`
- [ ] Tag release: `phase-[XX]-complete` and `v[XX].0.0`
- [ ] Branch protection verified

---

## References

- **ADRs**: [List relevant ADR numbers]
- **Issues**: [List issue numbers]
- **PRs**: [List PR numbers]
- **Related Phases**: [XX-1, XX+1]
- **External Docs**: [Links]

---

## Notes

[Any additional phase-specific notes or context]
