/**
 * Tests for DailyFormatter
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DailyFormatter, type DailyAnalysisReport } from '../src/formatters/daily-formatter.js';

describe('DailyFormatter', () => {
  let formatter: DailyFormatter;
  let sampleReport: DailyAnalysisReport;

  beforeEach(() => {
    formatter = new DailyFormatter();

    // Create deterministic sample report
    sampleReport = {
      symbol: 'SPY',
      date: '2025-01-30',
      analysis: {
        bias: {
          direction: 'BULLISH',
          confidence: 75,
          reason: 'Higher highs and higher lows pattern',
          keyLevels: {
            resistance: 430.50,
            support: 425.00
          }
        },
        profile: {
          type: 'TREND_UP',
          characteristics: [
            'Strong opening drive',
            'Sustained buying pressure',
            'Late day continuation'
          ],
          volatility: 1.25
        },
        sessions: [
          {
            name: 'Morning',
            high: 428.50,
            low: 426.20,
            range: 2.30,
            barCount: 24
          },
          {
            name: 'Afternoon',
            high: 430.80,
            low: 428.00,
            range: 2.80,
            barCount: 24
          }
        ]
      },
      statistics: {
        barsAnalyzed: 78,
        timeframe: '5m',
        range: {
          high: 430.80,
          low: 426.20,
          close: 430.45
        }
      },
      timestamp: '2025-01-30T20:00:00.000Z',
      metadata: {
        provider: 'composite',
        cacheHit: false,
        latencyMs: 123
      }
    };
  });

  describe('Text Format', () => {
    it('should format as text', () => {
      const output = formatter.format(sampleReport, 'text');

      expect(output).toContain('Daily Analysis: SPY - 2025-01-30');
      expect(output).toContain('Market Bias:');
      expect(output).toContain('Direction: BULLISH');
      expect(output).toContain('Confidence: 75%');
      expect(output).toContain('Day Profile:');
      expect(output).toContain('Type: TREND_UP');
      expect(output).toContain('Session Extremes:');
      expect(output).toContain('Morning:');
      expect(output).toContain('Afternoon:');
      expect(output).toContain('Statistics:');
      expect(output).toContain('Bars Analyzed: 78');
    });

    it('should handle missing optional fields', () => {
      const minimalReport: DailyAnalysisReport = {
        symbol: 'QQQ',
        date: '2025-01-30',
        analysis: {
          bias: {
            direction: 'NEUTRAL'
          },
          profile: {
            type: 'K'
          }
        },
        statistics: {
          barsAnalyzed: 50,
          timeframe: '5m',
          range: {
            high: 400.00,
            low: 395.00,
            close: 398.50
          }
        },
        timestamp: '2025-01-30T20:00:00.000Z'
      };

      const output = formatter.format(minimalReport, 'text');

      expect(output).toContain('Daily Analysis: QQQ - 2025-01-30');
      expect(output).toContain('Direction: NEUTRAL');
      expect(output).toContain('Type: K');
      expect(output).toContain('Bars Analyzed: 50');
    });

    it('should include metadata when present', () => {
      const output = formatter.format(sampleReport, 'text');

      expect(output).toContain('Metadata:');
      expect(output).toContain('Provider: composite');
      expect(output).toContain('Cache Hit: No');
      expect(output).toContain('Latency: 123ms');
    });

    it('should format prices correctly', () => {
      const output = formatter.format(sampleReport, 'text');

      expect(output).toContain('Day High: 430.80');
      expect(output).toContain('Day Low: 426.20');
      expect(output).toContain('Close: 430.45');
    });
  });

  describe('JSON Format', () => {
    it('should format as JSON', () => {
      const output = formatter.format(sampleReport, 'json');
      const parsed = JSON.parse(output);

      expect(parsed.symbol).toBe('SPY');
      expect(parsed.date).toBe('2025-01-30');
      expect(parsed.analysis.bias.direction).toBe('BULLISH');
      expect(parsed.analysis.bias.confidence).toBe(75);
      expect(parsed.statistics.barsAnalyzed).toBe(78);
    });

    it('should be valid JSON', () => {
      const output = formatter.format(sampleReport, 'json');
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('should be deterministic', () => {
      const output1 = formatter.format(sampleReport, 'json');
      const output2 = formatter.format(sampleReport, 'json');

      expect(output1).toBe(output2);
    });
  });

  describe('Table Format', () => {
    it('should format as table', () => {
      const output = formatter.format(sampleReport, 'table');

      expect(output).toContain('┌');
      expect(output).toContain('│');
      expect(output).toContain('└');
      expect(output).toContain('Symbol');
      expect(output).toContain('SPY');
      expect(output).toContain('Bias');
      expect(output).toContain('BULLISH');
      expect(output).toContain('Profile');
      expect(output).toContain('TREND_UP');
    });

    it('should include price range table', () => {
      const output = formatter.format(sampleReport, 'table');

      expect(output).toContain('Price Level');
      expect(output).toContain('High');
      expect(output).toContain('Low');
      expect(output).toContain('Close');
      expect(output).toContain('430.80');
      expect(output).toContain('426.20');
      expect(output).toContain('430.45');
    });

    it('should include sessions table', () => {
      const output = formatter.format(sampleReport, 'table');

      expect(output).toContain('Session');
      expect(output).toContain('Morning');
      expect(output).toContain('Afternoon');
      expect(output).toContain('428.50');
      expect(output).toContain('430.80');
    });

    it('should handle missing sessions gracefully', () => {
      const reportNoSessions = {
        ...sampleReport,
        analysis: {
          ...sampleReport.analysis,
          sessions: undefined
        }
      };

      const output = formatter.format(reportNoSessions, 'table');
      expect(output).toBeTruthy();
      expect(output).toContain('Symbol');
      expect(output).toContain('SPY');
    });
  });

  describe('Markdown Format', () => {
    it('should format as markdown', () => {
      const output = formatter.format(sampleReport, 'markdown');

      expect(output).toContain('# Daily Analysis Report');
      expect(output).toContain('## SPY - 2025-01-30');
      expect(output).toContain('### Market Bias');
      expect(output).toContain('- **Direction**: BULLISH');
      expect(output).toContain('- **Confidence**: 75%');
      expect(output).toContain('### Day Profile');
      expect(output).toContain('- **Type**: TREND_UP');
      expect(output).toContain('### Session Analysis');
      expect(output).toContain('| Session | High | Low | Range | Bars |');
    });

    it('should include key levels', () => {
      const output = formatter.format(sampleReport, 'markdown');

      expect(output).toContain('**Key Levels**:');
      expect(output).toContain('resistance: 430.50');
      expect(output).toContain('support: 425.00');
    });

    it('should include characteristics', () => {
      const output = formatter.format(sampleReport, 'markdown');

      expect(output).toContain('**Characteristics**:');
      expect(output).toContain('- Strong opening drive');
      expect(output).toContain('- Sustained buying pressure');
      expect(output).toContain('- Late day continuation');
    });

    it('should include metadata section', () => {
      const output = formatter.format(sampleReport, 'markdown');

      expect(output).toContain('### Metadata');
      expect(output).toContain('- **Provider**: composite');
      expect(output).toContain('- **Cache Hit**: No');
      expect(output).toContain('- **Latency**: 123ms');
    });

    it('should include footer with timestamp', () => {
      const output = formatter.format(sampleReport, 'markdown');

      expect(output).toContain('---');
      expect(output).toContain('*Generated: 2025-01-30T20:00:00.000Z*');
    });

    it('should handle missing optional fields', () => {
      const minimalReport: DailyAnalysisReport = {
        symbol: 'IWM',
        date: '2025-01-30',
        analysis: {
          bias: {
            direction: 'BEARISH'
          },
          profile: {
            type: 'TREND_DOWN'
          }
        },
        statistics: {
          barsAnalyzed: 60,
          timeframe: '5m',
          range: {
            high: 200.00,
            low: 195.00,
            close: 196.00
          }
        },
        timestamp: '2025-01-30T20:00:00.000Z'
      };

      const output = formatter.format(minimalReport, 'markdown');

      expect(output).toContain('# Daily Analysis Report');
      expect(output).toContain('## IWM - 2025-01-30');
      expect(output).toContain('- **Direction**: BEARISH');
      expect(output).toContain('- **Type**: TREND_DOWN');
    });
  });

  describe('Format Determinism', () => {
    it('should produce deterministic text output', () => {
      const output1 = formatter.format(sampleReport, 'text');
      const output2 = formatter.format(sampleReport, 'text');

      expect(output1).toBe(output2);
    });

    it('should produce deterministic JSON output', () => {
      const output1 = formatter.format(sampleReport, 'json');
      const output2 = formatter.format(sampleReport, 'json');

      expect(output1).toBe(output2);
    });

    it('should produce deterministic table output', () => {
      const output1 = formatter.format(sampleReport, 'table');
      const output2 = formatter.format(sampleReport, 'table');

      expect(output1).toBe(output2);
    });

    it('should produce deterministic markdown output', () => {
      const output1 = formatter.format(sampleReport, 'markdown');
      const output2 = formatter.format(sampleReport, 'markdown');

      expect(output1).toBe(output2);
    });
  });

  describe('Partial Data Handling', () => {
    it('should handle empty sessions array', () => {
      const reportEmptySessions = {
        ...sampleReport,
        analysis: {
          ...sampleReport.analysis,
          sessions: []
        }
      };

      expect(() => formatter.format(reportEmptySessions, 'text')).not.toThrow();
      expect(() => formatter.format(reportEmptySessions, 'json')).not.toThrow();
      expect(() => formatter.format(reportEmptySessions, 'table')).not.toThrow();
      expect(() => formatter.format(reportEmptySessions, 'markdown')).not.toThrow();
    });

    it('should handle missing confidence', () => {
      const reportNoConfidence = {
        ...sampleReport,
        analysis: {
          ...sampleReport.analysis,
          bias: {
            direction: 'NEUTRAL'
          }
        }
      };

      const output = formatter.format(reportNoConfidence, 'text');
      expect(output).toContain('Direction: NEUTRAL');
      expect(output).not.toContain('Confidence:');
    });

    it('should handle missing characteristics', () => {
      const reportNoCharacteristics = {
        ...sampleReport,
        analysis: {
          ...sampleReport.analysis,
          profile: {
            type: 'K'
          }
        }
      };

      const output = formatter.format(reportNoCharacteristics, 'markdown');
      expect(output).toContain('- **Type**: K');
      expect(output).not.toContain('**Characteristics**');
    });

    it('should handle undefined metadata', () => {
      const reportNoMetadata = {
        ...sampleReport,
        metadata: undefined
      };

      const textOutput = formatter.format(reportNoMetadata, 'text');
      expect(textOutput).not.toContain('Metadata:');

      const markdownOutput = formatter.format(reportNoMetadata, 'markdown');
      expect(markdownOutput).not.toContain('### Metadata');
    });
  });

  describe('Default Format', () => {
    it('should default to text format', () => {
      const output = formatter.format(sampleReport);
      expect(output).toContain('Daily Analysis: SPY - 2025-01-30');
      expect(output).toContain('Market Bias:');
    });
  });
});