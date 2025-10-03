/**
 * @fileoverview Tests for PII redaction functionality
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createLogger } from '../src/createLogger.js';

describe('PII Redaction', () => {
  const testLogFile = path.join(process.cwd(), 'pii-test.log');

  afterEach(() => {
    if (fs.existsSync(testLogFile)) {
      fs.unlinkSync(testLogFile);
    }
  });

  it('should redact password fields', async () => {
    const logger = createLogger({
      level: 'info',
      json: true,
      filePath: testLogFile,
      console: false,
    });

    logger.info('User login', {
      username: 'alice',
      password: 'secret123',
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const logContent = fs.readFileSync(testLogFile, 'utf-8');
    assert.ok(logContent.includes('"username":"alice"'), 'Username should not be redacted');
    assert.ok(!logContent.includes('secret123'), 'Password value should be redacted');
    assert.ok(logContent.includes('[REDACTED]'), 'Redacted placeholder should appear');
  });

  it('should redact password variants (passwd, pwd)', async () => {
    const logger = createLogger({
      level: 'info',
      json: true,
      filePath: testLogFile,
      console: false,
    });

    logger.info('Credentials', {
      passwd: 'secret1',
      pwd: 'secret2',
      PASSWORD: 'secret3',
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const logContent = fs.readFileSync(testLogFile, 'utf-8');
    assert.ok(!logContent.includes('secret1'), 'passwd should be redacted');
    assert.ok(!logContent.includes('secret2'), 'pwd should be redacted');
    assert.ok(!logContent.includes('secret3'), 'PASSWORD should be redacted');
  });

  it('should redact API keys and tokens', async () => {
    const logger = createLogger({
      level: 'info',
      json: true,
      filePath: testLogFile,
      console: false,
    });

    logger.info('API request', {
      api_key: 'sk-abc123',
      apiKey: 'sk-def456',
      token: 'jwt-xyz789',
      secret: 'my-secret',
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const logContent = fs.readFileSync(testLogFile, 'utf-8');
    assert.ok(!logContent.includes('sk-abc123'), 'api_key should be redacted');
    assert.ok(!logContent.includes('sk-def456'), 'apiKey should be redacted');
    assert.ok(!logContent.includes('jwt-xyz789'), 'token should be redacted');
    assert.ok(!logContent.includes('my-secret'), 'secret should be redacted');
  });

  it('should redact authorization headers', async () => {
    const logger = createLogger({
      level: 'info',
      json: true,
      filePath: testLogFile,
      console: false,
    });

    logger.info('HTTP request', {
      method: 'GET',
      authorization: 'Bearer abc123',
      auth: 'Basic xyz789',
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const logContent = fs.readFileSync(testLogFile, 'utf-8');
    assert.ok(logContent.includes('"method":"GET"'), 'Non-sensitive fields should remain');
    assert.ok(!logContent.includes('Bearer abc123'), 'authorization should be redacted');
    assert.ok(!logContent.includes('Basic xyz789'), 'auth should be redacted');
  });

  it('should redact private keys', async () => {
    const logger = createLogger({
      level: 'info',
      json: true,
      filePath: testLogFile,
      console: false,
    });

    logger.info('Crypto keys', {
      private_key: '-----BEGIN PRIVATE KEY-----',
      privateKey: 'MIIEvQIBADANBgkqhkiG9w0BA',
      public_key: 'safe-to-log',
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const logContent = fs.readFileSync(testLogFile, 'utf-8');
    assert.ok(!logContent.includes('BEGIN PRIVATE KEY'), 'private_key should be redacted');
    assert.ok(!logContent.includes('MIIEvQIBADANBgkqhkiG9w0BA'), 'privateKey should be redacted');
    assert.ok(
      logContent.includes('"public_key":"safe-to-log"'),
      'public_key should not be redacted'
    );
  });

  it('should redact credit card and SSN', async () => {
    const logger = createLogger({
      level: 'info',
      json: true,
      filePath: testLogFile,
      console: false,
    });

    logger.info('Payment info', {
      credit_card: '4111-1111-1111-1111',
      creditCard: '5555-5555-5555-4444',
      ssn: '123-45-6789',
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const logContent = fs.readFileSync(testLogFile, 'utf-8');
    assert.ok(!logContent.includes('4111-1111-1111-1111'), 'credit_card should be redacted');
    assert.ok(!logContent.includes('5555-5555-5555-4444'), 'creditCard should be redacted');
    assert.ok(!logContent.includes('123-45-6789'), 'ssn should be redacted');
  });

  it('should redact nested sensitive fields', async () => {
    const logger = createLogger({
      level: 'info',
      json: true,
      filePath: testLogFile,
      console: false,
    });

    logger.info('Nested data', {
      user: {
        username: 'alice',
        password: 'secret',
        profile: {
          email: 'alice@example.com',
          api_key: 'sk-nested',
        },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const logContent = fs.readFileSync(testLogFile, 'utf-8');
    assert.ok(logContent.includes('"username":"alice"'), 'Nested username should remain');
    assert.ok(logContent.includes('"email":"alice@example.com"'), 'Email should remain');
    assert.ok(!logContent.includes('secret'), 'Nested password should be redacted');
    assert.ok(!logContent.includes('sk-nested'), 'Nested api_key should be redacted');
  });

  it('should handle arrays with sensitive data', async () => {
    const logger = createLogger({
      level: 'info',
      json: true,
      filePath: testLogFile,
      console: false,
    });

    logger.info('User batch', {
      users: [
        { username: 'alice', password: 'secret1' },
        { username: 'bob', password: 'secret2' },
      ],
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const logContent = fs.readFileSync(testLogFile, 'utf-8');
    assert.ok(logContent.includes('"username":"alice"'), 'Array usernames should remain');
    assert.ok(logContent.includes('"username":"bob"'), 'Array usernames should remain');
    assert.ok(!logContent.includes('secret1'), 'Array passwords should be redacted');
    assert.ok(!logContent.includes('secret2'), 'Array passwords should be redacted');
  });

  it('should not redact non-sensitive fields with similar names', async () => {
    const logger = createLogger({
      level: 'info',
      json: true,
      filePath: testLogFile,
      console: false,
    });

    logger.info('Safe fields', {
      username: 'alice',
      email: 'alice@example.com',
      user_id: '12345',
      description: 'password reset feature',
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const logContent = fs.readFileSync(testLogFile, 'utf-8');
    assert.ok(logContent.includes('"username":"alice"'), 'username should not be redacted');
    assert.ok(logContent.includes('"email":"alice@example.com"'), 'email should not be redacted');
    assert.ok(logContent.includes('"user_id":"12345"'), 'user_id should not be redacted');
    assert.ok(
      logContent.includes('password reset feature'),
      'description content should not be redacted'
    );
  });
});
