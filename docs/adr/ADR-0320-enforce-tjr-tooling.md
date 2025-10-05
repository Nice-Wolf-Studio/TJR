# ADR-0320: Enforce TJR Tooling in LLM Analysis Responses

**Status:** Proposed

**Date:** 2025-10-05

**Deciders:** Development Team

**Tags:** #architecture #llm-integration #trading-tools #enforcement #validation

---

## Context

### Problem Statement

We're building sophisticated TJR analytical tools (Premium/Discount, SMT, FVG, etc.) within the TJR Suite, but there's no guarantee that the LLM (via Discord bot or API) will actually use these tools when providing market analysis. The LLM might bypass our carefully crafted algorithms and provide its own interpretation based on general knowledge, leading to:

1. **Inconsistent analysis** - LLM reasoning may not align with TJR methodology
2. **Wasted development effort** - Tools built but never used
3. **Non-deterministic outputs** - Pure LLM responses vary; tool outputs are deterministic
4. **Lack of auditability** - Can't trace back analysis to specific tool outputs
5. **Quality degradation** - LLM's general knowledge inferior to specialized TJR algorithms

### Current State

The Discord bot currently can:
- Receive market analysis requests via Discord MCP
- Access market data through Databento
- Call the `/daily` command which uses `@tjr/analysis-kit`
- Return formatted responses

However, there's no enforcement that ensures:
- Required TJR components are included
- Tool outputs are used as the basis for recommendations
- Analysis follows TJR's specific methodology

---

## Decision

We will implement a **multi-layer enforcement mechanism** that makes it impossible for the system to provide trading analysis without using TJR analytical tools. The enforcement will operate at three levels:

1. **Tool Call Validation Layer** - Intercepts and validates all analysis requests
2. **Response Schema Enforcement** - Requires structured output with tool evidence
3. **Prompt Engineering Guards** - System prompts that mandate tool usage

### Architecture Overview

```
Discord Request
    ↓
[Request Router]
    ↓
[Tool Enforcement Layer] ← validates required tools called
    ↓
[TJR Tool Orchestrator] ← coordinates tool execution
    ├── Session Levels Engine
    ├── FVG Detector
    ├── SMT Analyzer
    ├── Premium/Discount Calculator
    ├── Order Flow Classifier
    └── Daily Bias Engine
    ↓
[Response Validator] ← ensures output includes tool evidence
    ↓
[LLM Formatter] ← converts tool output to natural language
    ↓
Discord Response
```

---

## Implementation Details

### 1. Tool Enforcement Layer (`packages/app/src/middleware/tool-enforcer.ts`)

```typescript
export interface AnalysisRequest {
  type: 'market_analysis' | 'trade_setup' | 'bias_check';
  symbol: string;
  timeframe: string;
  requiredTools: string[];
}

export class ToolEnforcer {
  private requiredToolsMap = {
    market_analysis: [
      'session_levels',
      'premium_discount',
      'order_flow',
      'daily_bias'
    ],
    trade_setup: [
      'session_levels',
      'fvg_detector',
      'smt_analyzer',
      'bos_detector',
      'liquidity_sweep',
      'target_generator'
    ],
    bias_check: [
      'daily_bias',
      'trend_phase',
      'premium_discount'
    ]
  };

  async enforceToolUsage(request: AnalysisRequest): Promise<ToolExecutionResult> {
    const requiredTools = this.requiredToolsMap[request.type];
    const executionPlan = this.createExecutionPlan(requiredTools);

    // Execute tools in dependency order
    const results = await this.executeTools(executionPlan, request);

    // Validate all required tools executed
    this.validateExecution(results, requiredTools);

    return results;
  }

  private validateExecution(results: ToolResults, required: string[]): void {
    for (const toolName of required) {
      if (!results[toolName]) {
        throw new ToolNotExecutedError(`Required tool '${toolName}' was not executed`);
      }
      if (!results[toolName].data) {
        throw new ToolFailedError(`Tool '${toolName}' returned no data`);
      }
    }
  }
}
```

### 2. Response Schema Enforcement (`packages/app/src/validators/response-schema.ts`)

```typescript
export interface TJRAnalysisResponse {
  metadata: {
    requestId: string;
    timestamp: string;
    symbol: string;
    toolsExecuted: string[];
  };

  analysis: {
    bias: {
      direction: 'LONG' | 'SHORT' | 'NEUTRAL';
      confidence: number;
      source: 'daily_bias_tool'; // Must reference tool
      evidence: BiasEvidence;
    };

    keyLevels: {
      sessionHighs: Level[];
      sessionLows: Level[];
      source: 'session_levels_tool';
    };

    patterns: {
      fvgs: FVG[];
      liquiditySweeps: Sweep[];
      source: 'pattern_detection_tools';
    };

    confluence: {
      score: number;
      factors: ConfluenceFactor[];
      source: 'confluence_scorer_tool';
    };
  };

  recommendation: {
    action: string;
    reasoning: string[];
    toolEvidence: {
      [toolName: string]: any;
    };
  };

  audit: {
    toolExecutionOrder: string[];
    toolTimings: { [tool: string]: number };
    dataPoints: { [tool: string]: number };
  };
}

export class ResponseValidator {
  validate(response: any): TJRAnalysisResponse {
    // Ensure all required fields present
    if (!response.analysis?.bias?.source) {
      throw new ValidationError('Response must include bias from tool');
    }

    // Ensure tool evidence provided
    if (Object.keys(response.recommendation.toolEvidence).length === 0) {
      throw new ValidationError('Response must include tool evidence');
    }

    // Validate each analysis component references a tool
    for (const component of Object.keys(response.analysis)) {
      if (!response.analysis[component].source) {
        throw new ValidationError(`Analysis component '${component}' must reference source tool`);
      }
    }

    return response as TJRAnalysisResponse;
  }
}
```

### 3. Command Interceptor (`packages/app/src/commands/tjr-command-wrapper.ts`)

```typescript
export class TJRCommandWrapper {
  constructor(
    private enforcer: ToolEnforcer,
    private validator: ResponseValidator,
    private llmService: LLMService
  ) {}

  async handleAnalysisRequest(
    message: string,
    context: DiscordContext
  ): Promise<string> {
    // 1. Parse request to identify analysis type
    const request = this.parseRequest(message);

    // 2. Execute required tools
    const toolResults = await this.enforcer.enforceToolUsage(request);

    // 3. Build structured response
    const structuredResponse = this.buildStructuredResponse(toolResults);

    // 4. Validate response schema
    const validatedResponse = this.validator.validate(structuredResponse);

    // 5. Format with LLM (constrained to use tool data)
    const formattedResponse = await this.formatWithLLM(
      validatedResponse,
      this.getConstrainedPrompt()
    );

    return formattedResponse;
  }

  private getConstrainedPrompt(): string {
    return `
    You are formatting a market analysis response. You MUST:
    1. Use ONLY the provided tool data for analysis
    2. Reference specific tool outputs in your explanation
    3. Include tool names when citing data points
    4. Do not add analysis beyond what tools provide
    5. Format the technical data in a clear, accessible way

    Tool data provided:
    {toolData}

    Format this analysis for a Discord response. Be precise and reference tools.
    `;
  }
}
```

### 4. Discord Bot Integration (`packages/discord-mcp/src/analysis-handler.ts`)

```typescript
export class AnalysisHandler {
  private wrapper: TJRCommandWrapper;

  async handleMessage(message: Message): Promise<void> {
    // Detect analysis request keywords
    if (this.isAnalysisRequest(message.content)) {
      // Show thinking indicator
      await message.channel.sendTyping();

      try {
        // Process through enforcement pipeline
        const response = await this.wrapper.handleAnalysisRequest(
          message.content,
          { channel: message.channel, user: message.author }
        );

        // Send response with tool attribution
        await message.reply({
          content: response,
          embeds: [this.createToolAttributionEmbed(response)]
        });
      } catch (error) {
        if (error instanceof ToolNotExecutedError) {
          await message.reply('Failed to execute required analysis tools.');
        }
      }
    }
  }

  private createToolAttributionEmbed(response: string): MessageEmbed {
    return new MessageEmbed()
      .setTitle('Analysis Tools Used')
      .addField('Primary', 'Daily Bias Engine v2.0')
      .addField('Components', [
        '• Session Levels Tracker',
        '• FVG Pattern Detector',
        '• SMT Divergence Analyzer',
        '• Premium/Discount Calculator'
      ].join('\n'))
      .setFooter('Powered by TJR Trading Suite')
      .setColor('#00ff00');
  }
}
```

### 5. System Prompt Guards (`packages/app/src/prompts/tjr-system-prompt.ts`)

```typescript
export const TJR_SYSTEM_PROMPT = `
You are the TJR Trading Assistant. You MUST follow these rules:

MANDATORY TOOL USAGE:
1. NEVER provide market analysis without executing TJR tools
2. ALWAYS cite which tool provided each data point
3. If tools fail, respond with "Unable to analyze - tools unavailable"

REQUIRED ANALYSIS COMPONENTS:
- Daily Bias (from daily_bias tool)
- Session Levels (from session_levels tool)
- Key Patterns (from fvg_detector, smt_analyzer)
- Premium/Discount Zones (from pd_calculator)
- Confluence Score (from confluence_scorer)

FORBIDDEN ACTIONS:
- Do NOT provide trading advice based on general knowledge
- Do NOT analyze charts without tool outputs
- Do NOT make up levels or patterns not detected by tools
- Do NOT provide entries/exits without execution_engine confirmation

RESPONSE FORMAT:
1. Start with tool execution summary
2. Present findings from each tool
3. Synthesize into coherent analysis
4. Cite tool source for every claim

Example:
"Based on TJR tool analysis:
- Daily Bias: LONG (confidence: 78%, source: daily_bias_engine)
- Session High: 4521.50 (source: session_levels_tracker)
- FVG detected at 4515.25-4516.75 (source: fvg_detector)
..."
`;
```

---

## Consequences

### Positive

1. **Guaranteed tool usage** - Analysis always based on TJR methodology
2. **Consistent outputs** - Deterministic tool results ensure reproducibility
3. **Full auditability** - Every recommendation traceable to specific tool outputs
4. **Quality assurance** - Specialized algorithms superior to general LLM knowledge
5. **Development ROI** - Ensures investment in tool development is utilized

### Negative

1. **Increased latency** - Tool execution adds 200-500ms per request
2. **Rigid responses** - Less flexibility in response format
3. **Tool dependencies** - If tools fail, entire analysis fails
4. **Development complexity** - Additional enforcement layer to maintain

### Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Tool execution timeout | Analysis fails | Implement 5-second timeout with fallback to cached results |
| Enforcement too strict | Valid analyses rejected | Add override mechanism for admin users |
| LLM attempts bypass | Inconsistent analysis | Multiple validation layers + prompt engineering |
| Performance degradation | Poor user experience | Tool result caching, parallel execution |

---

## Implementation Plan

### Phase 1: Core Enforcement (Week 1)
- [ ] Implement `ToolEnforcer` class
- [ ] Create required tools mapping
- [ ] Add execution validation

### Phase 2: Response Validation (Week 1-2)
- [ ] Define `TJRAnalysisResponse` schema
- [ ] Implement `ResponseValidator`
- [ ] Add schema enforcement

### Phase 3: Command Integration (Week 2)
- [ ] Create `TJRCommandWrapper`
- [ ] Integrate with existing commands
- [ ] Add error handling

### Phase 4: Discord Integration (Week 2-3)
- [ ] Implement `AnalysisHandler`
- [ ] Add tool attribution embeds
- [ ] Update Discord bot

### Phase 5: Testing & Monitoring (Week 3)
- [ ] Unit tests for each component
- [ ] Integration tests for full pipeline
- [ ] Add metrics collection
- [ ] Performance profiling

---

## Metrics for Success

1. **Tool Usage Rate**: 100% of analysis requests use required tools
2. **Validation Pass Rate**: >95% of responses pass schema validation
3. **User Satisfaction**: No degradation in response quality scores
4. **Performance Impact**: <500ms added latency for tool execution
5. **Audit Coverage**: 100% of recommendations traceable to tool outputs

---

## Related ADRs

- ADR-0318: TJR Algorithmic Strategy Implementation Architecture
- ADR-0315: Discord Bot HTTP API Integration
- ADR-0209: TJR Tools Confluence Architecture
- ADR-0306: Daily Command Implementation

---

## Code Examples

### Example: Enforced Analysis Flow

```typescript
// User message: "What's the bias for ES?"

// 1. Request parsing
const request: AnalysisRequest = {
  type: 'bias_check',
  symbol: 'ES',
  timeframe: '5m',
  requiredTools: ['daily_bias', 'premium_discount', 'trend_phase']
};

// 2. Tool execution (enforced)
const toolResults = await enforcer.enforceToolUsage(request);
/* Returns:
{
  daily_bias: { direction: 'LONG', confidence: 0.75, ... },
  premium_discount: { zone: 'DISCOUNT', level: 0.38, ... },
  trend_phase: { phase: 'EXTENSION', ... }
}
*/

// 3. Response building (structured)
const response = {
  metadata: { toolsExecuted: ['daily_bias', 'premium_discount', 'trend_phase'] },
  analysis: {
    bias: { direction: 'LONG', source: 'daily_bias_tool', ... }
  },
  recommendation: {
    action: 'Look for long entries in discount zone',
    toolEvidence: { ...toolResults }
  }
};

// 4. Validation
validator.validate(response); // Throws if missing required fields

// 5. LLM formatting (constrained)
const formatted = await llm.format(response, TJR_SYSTEM_PROMPT);

// Final output to Discord
"According to TJR analysis tools:
📊 Daily Bias: LONG (75% confidence)
📍 Current Zone: DISCOUNT (38% retracement)
📈 Trend Phase: EXTENSION

Recommendation: Look for long entries at discount levels..."
```

---

## Decision

Approved for implementation. The multi-layer enforcement approach ensures TJR tools are always used while maintaining response quality and performance.