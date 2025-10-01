"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectProvider = selectProvider;
exports.loadCapabilities = loadCapabilities;
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
function selectProvider(providers, options) {
    const excluded = [];
    // Step 1: Filter by capability (timeframe, asset class, lookback)
    const capableProviders = providers.filter((p) => {
        if (!p.timeframes.includes(options.timeframe)) {
            excluded.push({
                providerId: p.providerId,
                reason: `does not support ${options.timeframe} timeframe`,
            });
            return false;
        }
        if (!p.assetClasses.includes(options.assetClass)) {
            excluded.push({
                providerId: p.providerId,
                reason: `does not support ${options.assetClass} asset class`,
            });
            return false;
        }
        if (p.maxLookbackDays < options.lookbackDays) {
            excluded.push({
                providerId: p.providerId,
                reason: `max lookback ${p.maxLookbackDays}d < required ${options.lookbackDays}d`,
            });
            return false;
        }
        return true;
    });
    // No capable providers
    if (capableProviders.length === 0) {
        return {
            providerId: null,
            reason: `No capable providers found for ${options.timeframe} ${options.assetClass} with ${options.lookbackDays}d lookback`,
            excluded,
        };
    }
    // Step 2: Filter by freshness constraint (if specified)
    let freshProviders = capableProviders;
    if (options.maxStalenessSec !== undefined) {
        freshProviders = capableProviders.filter((p) => {
            if (p.freshnessSeconds > options.maxStalenessSec) {
                excluded.push({
                    providerId: p.providerId,
                    reason: `freshness ${p.freshnessSeconds}s exceeds max staleness ${options.maxStalenessSec}s`,
                });
                return false;
            }
            return true;
        });
        // No providers meet freshness constraint
        if (freshProviders.length === 0) {
            return {
                providerId: null,
                reason: `No providers meet freshness constraint ${options.maxStalenessSec}s (capable providers: ${capableProviders.map((p) => p.providerId).join(", ")})`,
                excluded,
            };
        }
    }
    // Step 3: If preferProviderId is specified and capable, select it
    if (options.preferProviderId) {
        const preferred = freshProviders.find((p) => p.providerId === options.preferProviderId);
        if (preferred) {
            return {
                providerId: preferred.providerId,
                reason: `Selected ${preferred.providerId} (preferred): supports ${options.timeframe} timeframe, ${options.assetClass} asset class, ${options.lookbackDays}d lookback${options.maxStalenessSec !== undefined ? `, freshness ${preferred.freshnessSeconds}s <= ${options.maxStalenessSec}s max` : ""}, priority ${preferred.priority}`,
                excluded,
            };
        }
        else {
            // Preferred provider not capable, log why
            const preferredProvider = providers.find((p) => p.providerId === options.preferProviderId);
            if (preferredProvider) {
                const preferredExclusion = excluded.find((e) => e.providerId === options.preferProviderId);
                if (!preferredExclusion) {
                    excluded.push({
                        providerId: options.preferProviderId,
                        reason: "preferred but not capable (unknown reason)",
                    });
                }
            }
        }
    }
    // Step 4: Select provider with lowest priority value
    const selected = freshProviders.reduce((best, current) => current.priority < best.priority ? current : best);
    return {
        providerId: selected.providerId,
        reason: `Selected ${selected.providerId}: supports ${options.timeframe} timeframe, ${options.assetClass} asset class, ${options.lookbackDays}d lookback${options.maxStalenessSec !== undefined ? `, freshness ${selected.freshnessSeconds}s <= ${options.maxStalenessSec}s max` : ""}, priority ${selected.priority}`,
        excluded,
    };
}
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
function loadCapabilities(capabilitiesConfig) {
    return capabilitiesConfig.providers;
}
//# sourceMappingURL=composite.js.map