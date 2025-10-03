'use strict';
/**
 * @tjr-suite/db-simple
 *
 * Minimal database connection and migration runner for SQLite and PostgreSQL
 */
Object.defineProperty(exports, '__esModule', { value: true });
exports.runMigrations = exports.connect = void 0;
var connect_js_1 = require('./connect.js');
Object.defineProperty(exports, 'connect', {
  enumerable: true,
  get: function () {
    return connect_js_1.connect;
  },
});
var migrate_js_1 = require('./migrate.js');
Object.defineProperty(exports, 'runMigrations', {
  enumerable: true,
  get: function () {
    return migrate_js_1.runMigrations;
  },
});
//# sourceMappingURL=index.js.map
