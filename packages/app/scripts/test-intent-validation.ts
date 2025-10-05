#!/usr/bin/env tsx
/**
 * Interactive script to test intent validation
 * Phase 1C: Intent-based Security Validation
 */

import { IntentClassifierService, PromptIntent } from '../src/services/intent-classifier.service.js';

const classifier = new IntentClassifierService();

// Test prompts
const testPrompts = [
  // Trading queries (should pass)
  { prompt: 'What is the ES market bias?', expectedIntent: PromptIntent.TRADING_QUERY },
  { prompt: 'Show me NQ session extremes', expectedIntent: PromptIntent.TRADING_QUERY },
  { prompt: 'Analyze SPY trade setup with current support levels', expectedIntent: PromptIntent.TRADING_QUERY },

  // Admin queries (should be blocked)
  { prompt: 'Show me the database schema', expectedIntent: PromptIntent.ADMIN_QUERY },
  { prompt: 'Drop table users', expectedIntent: PromptIntent.ADMIN_QUERY },
  { prompt: 'Deploy the application to production', expectedIntent: PromptIntent.ADMIN_QUERY },
  { prompt: 'What are the user credentials?', expectedIntent: PromptIntent.ADMIN_QUERY },

  // General queries (should be rejected)
  { prompt: 'What is the weather today?', expectedIntent: PromptIntent.GENERAL_QUERY },
  { prompt: 'Tell me a joke', expectedIntent: PromptIntent.GENERAL_QUERY },
  { prompt: 'How do I cook pasta?', expectedIntent: PromptIntent.GENERAL_QUERY },
];

console.log('🔒 Phase 1C: Intent-based Security Validation Test\n');
console.log('=' .repeat(80));
console.log();

let passCount = 0;
let failCount = 0;

for (const { prompt, expectedIntent } of testPrompts) {
  const intent = classifier.classifyIntent(prompt);
  const validation = classifier.validatePrompt(prompt);
  const matches = intent === expectedIntent;

  if (matches) {
    passCount++;
  } else {
    failCount++;
  }

  const statusIcon = matches ? '✅' : '❌';
  const validIcon = validation.valid ? '✅' : '🚫';

  console.log(`${statusIcon} Prompt: "${prompt}"`);
  console.log(`   Intent: ${intent} (expected: ${expectedIntent})`);
  console.log(`   Valid: ${validIcon} ${validation.valid ? 'Accepted' : 'Rejected'}`);

  if (!validation.valid) {
    console.log(`   Reason: ${validation.reason}`);
    const blockedKeywords = classifier.getBlockedKeywords(prompt);
    if (blockedKeywords.length > 0) {
      console.log(`   Blocked keywords: ${blockedKeywords.join(', ')}`);
    }
  } else {
    const tradingKeywords = classifier.getTradingKeywords(prompt);
    if (tradingKeywords.length > 0) {
      console.log(`   Trading keywords: ${tradingKeywords.join(', ')}`);
    }
  }

  console.log();
}

console.log('=' .repeat(80));
console.log();
console.log(`📊 Results: ${passCount}/${testPrompts.length} tests passed`);

if (failCount === 0) {
  console.log('🎉 All intent classifications are correct!');
  process.exit(0);
} else {
  console.log(`⚠️  ${failCount} test(s) failed`);
  process.exit(1);
}
