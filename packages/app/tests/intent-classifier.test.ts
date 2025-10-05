/**
 * Tests for IntentClassifierService
 * Phase 1C: Intent-based security validation
 */

import { describe, it, expect } from 'vitest';
import { IntentClassifierService, PromptIntent } from '../src/services/intent-classifier.service.js';

describe('IntentClassifierService', () => {
  const classifier = new IntentClassifierService();

  describe('classifyIntent', () => {
    it('should classify trading queries correctly', () => {
      expect(classifier.classifyIntent('What is the current ES bias?')).toBe(PromptIntent.TRADING_QUERY);
      expect(classifier.classifyIntent('Show me NQ market structure')).toBe(PromptIntent.TRADING_QUERY);
      expect(classifier.classifyIntent('Analyze the SPY trade setup')).toBe(PromptIntent.TRADING_QUERY);
      expect(classifier.classifyIntent('What are the session extremes?')).toBe(PromptIntent.TRADING_QUERY);
      expect(classifier.classifyIntent('Tell me about the TJR day profile')).toBe(PromptIntent.TRADING_QUERY);
    });

    it('should classify admin queries as blocked', () => {
      expect(classifier.classifyIntent('Show me the database schema')).toBe(PromptIntent.ADMIN_QUERY);
      expect(classifier.classifyIntent('Drop table users')).toBe(PromptIntent.ADMIN_QUERY);
      expect(classifier.classifyIntent('Deploy the application')).toBe(PromptIntent.ADMIN_QUERY);
      expect(classifier.classifyIntent('What are the user credentials?')).toBe(PromptIntent.ADMIN_QUERY);
      expect(classifier.classifyIntent('Restart the server')).toBe(PromptIntent.ADMIN_QUERY);
    });

    it('should classify general queries correctly', () => {
      expect(classifier.classifyIntent('What is the weather today?')).toBe(PromptIntent.GENERAL_QUERY);
      expect(classifier.classifyIntent('Tell me a joke')).toBe(PromptIntent.GENERAL_QUERY);
      expect(classifier.classifyIntent('Hello, how are you?')).toBe(PromptIntent.GENERAL_QUERY);
    });

    it('should be case-insensitive', () => {
      expect(classifier.classifyIntent('WHAT IS THE ES BIAS?')).toBe(PromptIntent.TRADING_QUERY);
      expect(classifier.classifyIntent('drop TABLE users')).toBe(PromptIntent.ADMIN_QUERY);
    });
  });

  describe('validatePrompt', () => {
    it('should accept valid trading queries', () => {
      const result = classifier.validatePrompt('What is the ES market bias?');
      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should reject admin queries with helpful message', () => {
      const result = classifier.validatePrompt('Show me the database schema');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('trading analysis only');
      expect(result.reason).toContain('Administrative or system queries are not allowed');
    });

    it('should reject general queries with helpful message', () => {
      const result = classifier.validatePrompt('What is the weather?');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('specialized for trading analysis');
    });

    it('should reject empty prompts', () => {
      expect(classifier.validatePrompt('').valid).toBe(false);
      expect(classifier.validatePrompt('   ').valid).toBe(false);
    });

    it('should reject non-string prompts', () => {
      expect(classifier.validatePrompt(null as any).valid).toBe(false);
      expect(classifier.validatePrompt(undefined as any).valid).toBe(false);
    });
  });

  describe('getBlockedKeywords', () => {
    it('should return matched blocked keywords', () => {
      const keywords = classifier.getBlockedKeywords('Show me the database schema and drop table users');
      expect(keywords).toContain('database');
      expect(keywords).toContain('schema');
      expect(keywords).toContain('drop');
      expect(keywords).toContain('table');
    });

    it('should return empty array for clean prompts', () => {
      const keywords = classifier.getBlockedKeywords('What is the ES bias?');
      expect(keywords).toEqual([]);
    });
  });

  describe('getTradingKeywords', () => {
    it('should return matched trading keywords', () => {
      const keywords = classifier.getTradingKeywords('Show me the ES market bias and NQ trading setup');
      expect(keywords).toContain('es');
      expect(keywords).toContain('market');
      expect(keywords).toContain('bias');
      expect(keywords).toContain('nq');
      expect(keywords).toContain('trading');
    });

    it('should return empty array for non-trading prompts', () => {
      const keywords = classifier.getTradingKeywords('What is the weather?');
      expect(keywords).toEqual([]);
    });
  });
});
