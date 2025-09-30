/**
 * @fileoverview Risk management configuration types and defaults.
 * @module @tjr/tjr-tools/risk/risk-config
 */

/**
 * Risk management configuration.
 *
 * Defines all parameters for position sizing, daily stops, and partial exits.
 * All settings are optional with sensible defaults for conservative risk management.
 */
export interface RiskConfig {
  /** Account settings */
  account: {
    /** Current account balance */
    balance: number;
    /** Account currency */
    currency: 'USD' | 'EUR' | 'GBP';
    /** IANA timezone for daily stop calculations (e.g., 'America/New_York') */
    timezone: string;
  };

  /** Per-trade risk parameters */
  perTrade: {
    /** Maximum risk per trade as percentage of account (default: 1%) */
    maxRiskPercent: number;
    /** Optional: Absolute maximum risk amount in currency */
    maxRiskAmount?: number;
    /** Kelly Criterion safety factor (default: 0.25) */
    kellyFraction?: number;
    /** Enable Kelly Criterion position sizing (default: false) */
    useKelly: boolean;
    /** Win rate for Kelly Criterion (0-1, required if useKelly=true) */
    winRate?: number;
    /** Average win amount for Kelly Criterion */
    avgWin?: number;
    /** Average loss amount for Kelly Criterion */
    avgLoss?: number;
  };

  /** Daily loss limits */
  dailyLimits: {
    /** Maximum daily loss as percentage of account (default: 3%) */
    maxLossPercent: number;
    /** Optional: Absolute maximum daily loss in currency */
    maxLossAmount?: number;
    /** Optional: Stop after N consecutive losses */
    maxConsecutiveLosses?: number;
    /** Include trading fees in loss calculations (default: true) */
    includeFees: boolean;
  };

  /** Partial exit strategy */
  partialExits: {
    /** Exit strategy type */
    strategy: 'r-multiple' | 'percentage' | 'fibonacci' | 'custom';
    /** Exit levels configuration */
    levels: Array<{
      /** Trigger point (R-multiple or price depending on strategy) */
      trigger: number;
      /** Percentage of position to exit (0-100) */
      exitPercent: number;
    }>;
    /** Optional: Trailing stop configuration */
    trailStop?: {
      /** Activation level in R-multiples */
      activate: number;
      /** Trail distance (ATR multiplier or percentage) */
      distance: number;
    };
  };

  /** Position size constraints */
  constraints: {
    /** Minimum viable position size (shares/contracts) */
    minPositionSize: number;
    /** Maximum position size as percentage of account (default: 20%) */
    maxPositionPercent: number;
    /** Round position size to standard lots (default: true) */
    roundLots: boolean;
    /** Standard lot size for rounding (default: 1) */
    lotSize?: number;
  };
}

/**
 * Default risk configuration for conservative trading.
 *
 * - 1% risk per trade
 * - 3% maximum daily loss
 * - R-multiple exits at 1R, 2R, 3R
 * - Fixed percentage position sizing (Kelly disabled by default)
 */
export const DEFAULT_RISK_CONFIG: RiskConfig = {
  account: {
    balance: 10000,
    currency: 'USD',
    timezone: 'America/New_York',
  },
  perTrade: {
    maxRiskPercent: 1.0,
    kellyFraction: 0.25,
    useKelly: false,
  },
  dailyLimits: {
    maxLossPercent: 3.0,
    includeFees: true,
  },
  partialExits: {
    strategy: 'r-multiple',
    levels: [
      { trigger: 1.0, exitPercent: 33 },
      { trigger: 2.0, exitPercent: 33 },
      { trigger: 3.0, exitPercent: 34 },
    ],
  },
  constraints: {
    minPositionSize: 1,
    maxPositionPercent: 20.0,
    roundLots: true,
    lotSize: 1,
  },
};

/**
 * Validate risk configuration.
 *
 * Checks all parameters for valid ranges and logical consistency.
 * Throws descriptive errors for invalid configurations.
 *
 * @param config - Risk configuration to validate
 * @throws Error if configuration is invalid
 */
export function validateRiskConfig(config: RiskConfig): void {
  // Validate account
  if (config.account.balance <= 0) {
    throw new Error('Account balance must be positive');
  }

  if (!['USD', 'EUR', 'GBP'].includes(config.account.currency)) {
    throw new Error('Invalid currency. Must be USD, EUR, or GBP');
  }

  if (!config.account.timezone || typeof config.account.timezone !== 'string') {
    throw new Error('Account timezone is required');
  }

  // Validate per-trade risk
  if (config.perTrade.maxRiskPercent <= 0 || config.perTrade.maxRiskPercent > 100) {
    throw new Error('maxRiskPercent must be between 0 and 100');
  }

  if (config.perTrade.maxRiskAmount !== undefined && config.perTrade.maxRiskAmount <= 0) {
    throw new Error('maxRiskAmount must be positive');
  }

  if (config.perTrade.useKelly) {
    if (config.perTrade.winRate === undefined || config.perTrade.winRate <= 0 || config.perTrade.winRate >= 1) {
      throw new Error('winRate must be between 0 and 1 when using Kelly Criterion');
    }
    if (config.perTrade.avgWin === undefined || config.perTrade.avgWin <= 0) {
      throw new Error('avgWin must be positive when using Kelly Criterion');
    }
    if (config.perTrade.avgLoss === undefined || config.perTrade.avgLoss <= 0) {
      throw new Error('avgLoss must be positive when using Kelly Criterion');
    }
  }

  if (config.perTrade.kellyFraction !== undefined) {
    if (config.perTrade.kellyFraction <= 0 || config.perTrade.kellyFraction > 1) {
      throw new Error('kellyFraction must be between 0 and 1');
    }
  }

  // Validate daily limits
  if (config.dailyLimits.maxLossPercent <= 0 || config.dailyLimits.maxLossPercent > 100) {
    throw new Error('maxLossPercent must be between 0 and 100');
  }

  if (config.dailyLimits.maxLossAmount !== undefined && config.dailyLimits.maxLossAmount <= 0) {
    throw new Error('maxLossAmount must be positive');
  }

  if (config.dailyLimits.maxConsecutiveLosses !== undefined && config.dailyLimits.maxConsecutiveLosses < 1) {
    throw new Error('maxConsecutiveLosses must be at least 1');
  }

  // Validate partial exits
  if (!['r-multiple', 'percentage', 'fibonacci', 'custom'].includes(config.partialExits.strategy)) {
    throw new Error('Invalid partial exit strategy');
  }

  if (!Array.isArray(config.partialExits.levels) || config.partialExits.levels.length === 0) {
    throw new Error('At least one partial exit level is required');
  }

  let totalExitPercent = 0;
  for (const level of config.partialExits.levels) {
    if (level.trigger <= 0) {
      throw new Error('Exit trigger must be positive');
    }
    if (level.exitPercent <= 0 || level.exitPercent > 100) {
      throw new Error('Exit percent must be between 0 and 100');
    }
    totalExitPercent += level.exitPercent;
  }

  if (Math.abs(totalExitPercent - 100) > 0.01) {
    throw new Error(`Exit percentages must sum to 100, got ${totalExitPercent}`);
  }

  // Validate trailing stop
  if (config.partialExits.trailStop) {
    if (config.partialExits.trailStop.activate <= 0) {
      throw new Error('Trailing stop activation must be positive');
    }
    if (config.partialExits.trailStop.distance <= 0) {
      throw new Error('Trailing stop distance must be positive');
    }
  }

  // Validate constraints
  if (config.constraints.minPositionSize < 0) {
    throw new Error('minPositionSize cannot be negative');
  }

  if (config.constraints.maxPositionPercent <= 0 || config.constraints.maxPositionPercent > 100) {
    throw new Error('maxPositionPercent must be between 0 and 100');
  }

  if (config.constraints.lotSize !== undefined && config.constraints.lotSize <= 0) {
    throw new Error('lotSize must be positive');
  }

  // Cross-validation
  if (config.perTrade.maxRiskPercent > config.dailyLimits.maxLossPercent) {
    throw new Error('Per-trade risk cannot exceed daily loss limit');
  }
}

/**
 * Merge partial risk configuration with defaults.
 *
 * Allows users to specify only the parameters they want to override,
 * with all other values falling back to sensible defaults.
 *
 * @param partial - Partial risk configuration
 * @returns Complete risk configuration
 */
export function mergeRiskConfig(partial: Partial<RiskConfig>): RiskConfig {
  const merged: RiskConfig = {
    account: {
      ...DEFAULT_RISK_CONFIG.account,
      ...partial.account,
    },
    perTrade: {
      ...DEFAULT_RISK_CONFIG.perTrade,
      ...partial.perTrade,
    },
    dailyLimits: {
      ...DEFAULT_RISK_CONFIG.dailyLimits,
      ...partial.dailyLimits,
    },
    partialExits: {
      ...DEFAULT_RISK_CONFIG.partialExits,
      ...partial.partialExits,
    },
    constraints: {
      ...DEFAULT_RISK_CONFIG.constraints,
      ...partial.constraints,
    },
  };

  validateRiskConfig(merged);
  return merged;
}