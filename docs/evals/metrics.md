# Backtesting Metrics Documentation

## Overview

The backtesting CLI (`replay-run`) computes comprehensive metrics for evaluating trading strategies and system performance. This document describes each metric category and how to interpret the results.

## Metric Categories

### 1. Hit-Rate Metrics

**Purpose**: Measure the success rate of trading signals

**Metrics**:
- `overall`: Overall success percentage across all trades
- `long`: Success rate for long trades only
- `short`: Success rate for short trades only
- `totalSignals`: Count of all signals generated
- `successful`: Count of successful signals (reached TP before SL)
- `failed`: Count of failed signals (hit SL before TP)

**Formula**:
```
hit_rate = (successful_trades / total_trades) * 100
```

**Interpretation**:
- < 50%: Strategy is losing money
- 50-60%: Break-even to modest gains
- 60-70%: Good performance
- \> 70%: Excellent performance

**Example**:
```json
{
  "hitRate": {
    "overall": 65.5,
    "long": 70.0,
    "short": 60.0,
    "totalSignals": 45,
    "successful": 29,
    "failed": 16
  }
}
```

### 2. Precision@K Metrics

**Purpose**: Measure relevance of top-K ranked predictions

**Metrics**:
- `k1`: Precision at top 1 (most important)
- `k3`: Precision at top 3
- `k5`: Precision at top 5
- `k10`: Precision at top 10

**Formula**:
```
precision@k = (relevant_items_in_top_k / k) * 100
```

**Use Cases**:
- Evaluating confluence scoring systems
- Validating zone ranking algorithms
- Comparing different scoring approaches

**Interpretation**:
- k1 = 100%: Best-scored item is always relevant
- k3 > 66%: Top 3 are mostly relevant
- Declining precision with higher K is normal

**Example**:
```json
{
  "precisionAtK": {
    "k1": 100.0,
    "k3": 66.7,
    "k5": 60.0,
    "k10": 50.0
  }
}
```

### 3. Latency Metrics

**Purpose**: Performance benchmarking and regression detection

**Metrics**:
- `min`: Fastest execution time (ms)
- `max`: Slowest execution time (ms)
- `mean`: Average execution time (ms)
- `median`: Middle value (50th percentile)
- `p95`: 95th percentile (ms)
- `p99`: 99th percentile (ms)
- `total`: Sum of all execution times (ms)

**Interpretation**:
- Use for performance regression testing
- Compare across code changes
- Identify bottlenecks in analysis pipeline

**Performance Targets**:
- analysis-kit: < 5ms per bar
- tjr-tools: < 10ms per bar
- Full day (78 bars): < 100ms total

**Example**:
```json
{
  "latency": {
    "min": 0.5,
    "max": 15.2,
    "mean": 3.4,
    "median": 2.8,
    "p95": 8.5,
    "p99": 12.1,
    "total": 265.2
  }
}
```

### 4. Signal Metrics

**Purpose**: Count detected patterns and signals

**Metrics**:
- `fvgs`: Fair Value Gaps detected
- `orderBlocks`: Order Blocks detected
- `executions`: Execution triggers generated
- `swings`: Swing points detected
- `avgConfluence`: Average confluence score

**Use Cases**:
- Validating detection algorithms
- Comparing module outputs
- Regression testing for pattern counts

**Example**:
```json
{
  "signals": {
    "fvgs": 12,
    "orderBlocks": 8,
    "executions": 5,
    "swings": 23,
    "avgConfluence": 72.3
  }
}
```

## Output Formats

### JSON (Default)

Complete structured output with all metrics:

```bash
replay-run --fixture samples/day.json --json
```

### CSV

Tabular format for spreadsheet analysis:

```bash
replay-run --fixture samples/day.json --csv
```

CSV columns include all metrics in flat structure for easy import.

### Pretty (Text Summary)

Human-readable multi-line summary:

```bash
replay-run --fixture samples/day.json --pretty
```

Output:
```
=== Backtest Summary ===
Fixture: samples/day.json
Symbol: ES | Date: 2024-10-01 | Bars: 78
Modules: analysis-kit, tjr-tools

Latency (ms):
  Mean: 3.4 | Median: 2.8 | P95: 8.5 | P99: 12.1
  Min: 0.5 | Max: 15.2 | Total: 265.2

Signals:
  FVGs: 12 | Order Blocks: 8 | Executions: 5 | Swings: 23
  Avg Confluence: 72.3
```

## Determinism

All metrics are deterministic:
- Same input always produces same output
- Floating-point values rounded to 1 decimal
- Arrays sorted consistently
- No randomness in computation

This enables:
- Reliable regression testing
- CI/CD integration
- Snapshot testing

## Module Support

### analysis-kit
- Swing detection
- Day profile classification
- Session extremes

### tjr-tools
- FVG detection
- Order Block detection
- Confluence scoring
- Execution triggers

### Usage

```bash
# Run both modules
replay-run --fixture day.json --modules analysis-kit,tjr-tools

# Run single module
replay-run --fixture day.json --modules tjr-tools

# Run all modules
replay-run --fixture day.json --modules all
```

## References

- ADR-0310: Backtesting v2 architecture decisions
- Issue #39: Implementation details
- `/packages/dev-scripts/src/metrics/`: Metrics implementation