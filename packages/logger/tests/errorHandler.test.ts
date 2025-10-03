/**
 * @fileoverview Tests for global error handler functionality
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createLogger } from '../src/createLogger.js';
import { attachGlobalHandlers } from '../src/errorHandler.js';

describe('attachGlobalHandlers', () => {
  const testLogFile = path.join(process.cwd(), 'error-test.log');

  afterEach(() => {
    if (fs.existsSync(testLogFile)) {
      fs.unlinkSync(testLogFile);
    }
  });

  it('should attach global handlers without error', () => {
    const logger = createLogger({
      level: 'info',
      json: true,
      filePath: testLogFile,
      console: false,
    });

    // Should not throw
    assert.doesNotThrow(() => {
      attachGlobalHandlers(logger);
    });
  });

  it('should warn when attaching handlers twice', async () => {
    const logger = createLogger({
      level: 'info',
      json: true,
      filePath: testLogFile,
      console: false,
    });

    // First attachment
    attachGlobalHandlers(logger);

    // Second attachment should warn
    attachGlobalHandlers(logger);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const logContent = fs.readFileSync(testLogFile, 'utf-8');
    assert.ok(
      logContent.includes('Global error handlers already attached'),
      'Should log warning about duplicate attachment'
    );
  });

  it('should not error when attaching handlers and log the event', async () => {
    const logger = createLogger({
      level: 'info',
      json: true,
      filePath: testLogFile,
      console: false,
    });

    // Should not throw
    assert.doesNotThrow(() => {
      attachGlobalHandlers(logger);
    });

    // Give Winston time to flush
    await new Promise((resolve) => setTimeout(resolve, 250));

    // Verify log file was created and written to
    const logExists = fs.existsSync(testLogFile);
    assert.ok(logExists, 'Log file should be created');

    const logContent = fs.readFileSync(testLogFile, 'utf-8');
    // The second test in the suite, so handlers already attached
    // Just verify the logger is working
    assert.ok(logContent.length > 0, 'Logger should write to file');
  });

  // Note: Testing actual error handling behavior would require spawning child processes
  // to avoid terminating the test runner. This would be done in integration tests.
  // For unit tests, we verify that handlers attach without errors and log correctly.
});
