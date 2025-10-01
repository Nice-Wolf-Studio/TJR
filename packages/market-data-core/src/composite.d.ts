/**
 * Composite provider selection policy.
 *
 * This module implements deterministic provider selection for market data
 * based on capabilities, freshness constraints, and priority overrides.
 * The selection algorithm ensures reproducible results and logs selection
 * reasons for debugging and compliance.
 *
 * Key features:
 * - Deterministic selection based on provider capabilities
 * - Freshness TTL enforcement
 * - Priority override support
 * - Comprehensive logging of selection rationale
 *
 * @packageDocumentation
 */
import type { Timeframe } from "./types.js";
/**
 * Provider capabilities metadata.
 *
 * Defines what data a provider can fetch and its operational characteristics.
 */
export interface ProviderCapabilities {
    /**
     * Unique provider identifier (e.g., "yahoo", "polygon", "alpaca").
     */
    providerId: string;
    /**
     * Supported timeframes for this provider.
     */
    timeframes: readonly Timeframe[];
    /**
     * Supported asset classes (e.g., "stocks", "crypto", "forex").
     */
    assetClasses: readonly string[];
    /**
     * Maximum lookback period in days.
     * Some providers only offer recent data (e.g., 7 days for free tiers).
     */
    maxLookbackDays: number;
    /**
     * Default priority (lower = higher priority).
     * Used as tie-breaker when multiple providers are equally capable.
     */
    priority: number;
    /**
     * Typical data freshness in seconds.
     * Real-time providers: 0
     * Delayed providers: 900 (15 minutes)
     * EOD providers: 86400 (24 hours)
     */
    freshnessSeconds: number;
}
/**
 * Provider selection options.
 */
export interface SelectProviderOptions {
    /**
     * Required timeframe.
     */
    timeframe: Timeframe;
    /**
     * Required asset class (e.g., "stocks", "crypto").
     */
    assetClass: string;
    /**
     * Required lookback period in days.
     */
    lookbackDays: number;
    /**
     * Maximum acceptable data staleness in seconds.
     * Providers with freshnessSeconds exceeding this will be excluded.
     */
    maxStalenessSec?: number;
    /**
     * Priority override: prefer this provider if capable.
     * If specified and capable, this provider will be selected regardless of priority.
     */
    preferProviderId?: string;
}
/**
 * Provider selection result.
 */
export interface ProviderSelectionResult {
    /**
     * Selected provider ID (null if no capable provider found).
     */
    providerId: string | null;
    /**
     * Human-readable selection reason for logging and debugging.
     */
    reason: string;
    /**
     * List of providers that were considered but excluded.
     */
    excluded: Array<{
        providerId: string;
        reason: string;
    }>;
}
/**
 * Select the best provider for a given market data request.
 *
 * Selection algorithm:
 * 1. Filter providers by capability (timeframe, asset class, lookback)
 * 2. Filter providers by freshness constraint (if specified)
 * 3. If preferProviderId is specified and capable, select it
 * 4. Otherwise, select provider with lowest priority value
 * 5. Log selection rationale
 *
 * This function is pure and deterministic: given the same inputs, it always
 * returns the same result.
 *
 * @param providers - Available providers with their capabilities
 * @param options - Selection criteria
 * @returns Provider selection result with selection reason
 *
 * @example
 * ```typescript
 * const providers = [
 *   { providerId: "yahoo", timeframes: ["1m", "5m", "1D"], assetClasses: ["stocks"], maxLookbackDays: 7, priority: 10, freshnessSeconds: 900 },
 *   { providerId: "polygon", timeframes: ["1m", "5m", "1h", "1D"], assetClasses: ["stocks", "crypto"], maxLookbackDays: 365, priority: 5, freshnessSeconds: 0 }
 * ];
 *
 * const result = selectProvider(providers, {
 *   timeframe: "5m",
 *   assetClass: "stocks",
 *   lookbackDays: 30,
 *   maxStalenessSec: 60
 * });
 *
 * console.log(result.providerId); // "polygon"
 * console.log(result.reason); // "Selected polygon: supports 5m timeframe, stocks asset class, 30d lookback, freshness 0s <= 60s max, priority 5"
 * ```
 */
export declare function selectProvider(providers: readonly ProviderCapabilities[], options: SelectProviderOptions): ProviderSelectionResult;
/**
 * Load provider capabilities from a capabilities configuration.
 *
 * In a real implementation, this would load from a JSON file or database.
 * For now, this is a placeholder that returns an empty array.
 *
 * @param capabilitiesConfig - Provider capabilities configuration
 * @returns Array of provider capabilities
 *
 * @example
 * ```typescript
 * const capabilities = loadCapabilities({
 *   providers: [
 *     { providerId: "yahoo", timeframes: ["1m", "5m", "1D"], ... }
 *   ]
 * });
 * ```
 */
export declare function loadCapabilities(capabilitiesConfig: {
    providers: readonly ProviderCapabilities[];
}): readonly ProviderCapabilities[];
//# sourceMappingURL=composite.d.ts.map