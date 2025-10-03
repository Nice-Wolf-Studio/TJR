'use strict';
/**
 * @fileoverview Main entry point for @tjr/contracts package.
 *
 * Exports all types, interfaces, classes, and utilities for TJR trading system.
 *
 * @module @tjr/contracts
 */
Object.defineProperty(exports, '__esModule', { value: true });
exports.isSymbolResolutionError =
  exports.isInsufficientBarsError =
  exports.isProviderRateLimitError =
  exports.isTJRError =
  exports.SymbolResolutionError =
  exports.InsufficientBarsError =
  exports.ProviderRateLimitError =
  exports.TJRError =
  exports.hasExecution =
  exports.getAllTimeframes =
  exports.parseTimeframe =
  exports.compareTimeframes =
  exports.getTimeframeLabel =
  exports.timeframeToMinutes =
  exports.isValidTimeframe =
  exports.Timeframe =
    void 0;
// Timeframes
var timeframes_js_1 = require('./timeframes.js');
Object.defineProperty(exports, 'Timeframe', {
  enumerable: true,
  get: function () {
    return timeframes_js_1.Timeframe;
  },
});
Object.defineProperty(exports, 'isValidTimeframe', {
  enumerable: true,
  get: function () {
    return timeframes_js_1.isValidTimeframe;
  },
});
Object.defineProperty(exports, 'timeframeToMinutes', {
  enumerable: true,
  get: function () {
    return timeframes_js_1.timeframeToMinutes;
  },
});
Object.defineProperty(exports, 'getTimeframeLabel', {
  enumerable: true,
  get: function () {
    return timeframes_js_1.getTimeframeLabel;
  },
});
Object.defineProperty(exports, 'compareTimeframes', {
  enumerable: true,
  get: function () {
    return timeframes_js_1.compareTimeframes;
  },
});
Object.defineProperty(exports, 'parseTimeframe', {
  enumerable: true,
  get: function () {
    return timeframes_js_1.parseTimeframe;
  },
});
Object.defineProperty(exports, 'getAllTimeframes', {
  enumerable: true,
  get: function () {
    return timeframes_js_1.getAllTimeframes;
  },
});
var tjr_js_1 = require('./tjr.js');
Object.defineProperty(exports, 'hasExecution', {
  enumerable: true,
  get: function () {
    return tjr_js_1.hasExecution;
  },
});
// Error classes and guards
var errors_js_1 = require('./errors.js');
Object.defineProperty(exports, 'TJRError', {
  enumerable: true,
  get: function () {
    return errors_js_1.TJRError;
  },
});
Object.defineProperty(exports, 'ProviderRateLimitError', {
  enumerable: true,
  get: function () {
    return errors_js_1.ProviderRateLimitError;
  },
});
Object.defineProperty(exports, 'InsufficientBarsError', {
  enumerable: true,
  get: function () {
    return errors_js_1.InsufficientBarsError;
  },
});
Object.defineProperty(exports, 'SymbolResolutionError', {
  enumerable: true,
  get: function () {
    return errors_js_1.SymbolResolutionError;
  },
});
Object.defineProperty(exports, 'isTJRError', {
  enumerable: true,
  get: function () {
    return errors_js_1.isTJRError;
  },
});
Object.defineProperty(exports, 'isProviderRateLimitError', {
  enumerable: true,
  get: function () {
    return errors_js_1.isProviderRateLimitError;
  },
});
Object.defineProperty(exports, 'isInsufficientBarsError', {
  enumerable: true,
  get: function () {
    return errors_js_1.isInsufficientBarsError;
  },
});
Object.defineProperty(exports, 'isSymbolResolutionError', {
  enumerable: true,
  get: function () {
    return errors_js_1.isSymbolResolutionError;
  },
});
//# sourceMappingURL=index.js.map
