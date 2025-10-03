const test = require('node:test');
const assert = require('node:assert/strict');

if (process.env.ALLOW_LIVE_TESTS === '1') {
  const { getRecentBars, getQuote } = require('../../databento/dist/index.js');
  const {
    extractSessionExtremes,
    calculateDailyBias,
    classifyDayProfile,
    detectSwings,
  } = require('../../analysis-kit/dist/index.js');

  test('live ES 1m analysis pipeline (shape checks only)', async () => {
    const quote = await getQuote('ES');
    assert.ok(Number.isFinite(quote.price));

    const bars = await getRecentBars('ES', '1m', 200);
    assert.ok(Array.isArray(bars) && bars.length > 50);

    const now = new Date();
    const start = new Date(now.getTime() - 6 * 3600 * 1000); // last 6h
    const extremes = extractSessionExtremes(
      bars.map((b) => ({
        timestamp: b.timestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
      { start, end: now }
    );
    if (extremes) {
      const bias = calculateDailyBias(bars, extremes);
      assert.ok(['bullish', 'bearish', 'neutral'].includes(bias.bias));
      const profile = classifyDayProfile(bars, extremes);
      assert.ok(['P', 'K', 'D'].includes(profile.type));
    }
    const swings = detectSwings(bars, 5);
    assert.ok(Array.isArray(swings));
  });
} else {
  test('live tests skipped (set ALLOW_LIVE_TESTS=1)', () => {
    assert.ok(true);
  });
}
