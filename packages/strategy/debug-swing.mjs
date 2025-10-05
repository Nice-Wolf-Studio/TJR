import { HtfSwings } from './dist/htf-swings.js';

const engine = new HtfSwings({
  symbol: 'ES',
  H1: { lookback: 2, keepRecent: 10 },
  H4: { lookback: 2, keepRecent: 5 }
});

engine.startDate('2024-01-15');

// Create a peak pattern: low, high, low
const bars = [
  { timestamp: new Date('2024-01-15T10:00:00Z').getTime(), open: 4500, high: 4505, low: 4495, close: 4500, volume: 1000 },
  { timestamp: new Date('2024-01-15T11:00:00Z').getTime(), open: 4500, high: 4520, low: 4500, close: 4515, volume: 1000 }, // Peak
  { timestamp: new Date('2024-01-15T12:00:00Z').getTime(), open: 4515, high: 4518, low: 4510, close: 4512, volume: 1000 },
  { timestamp: new Date('2024-01-15T13:00:00Z').getTime(), open: 4512, high: 4515, low: 4508, close: 4510, volume: 1000 },  // Confirms peak
  { timestamp: new Date('2024-01-15T14:00:00Z').getTime(), open: 4510, high: 4512, low: 4505, close: 4508, volume: 1000 }
];

console.log('Processing bars with left=2, right=2, confirm=1...');
bars.forEach((bar, i) => {
  console.log(`\nBar ${i}: H=${bar.high} L=${bar.low}`);
  engine.onBar(bar);
  const snapshot = engine.getSnapshot();
  console.log(`  After bar ${i}: ${snapshot.H1.swingHighs.length} confirmed highs, ${snapshot.H1.swingLows.length} confirmed lows`);
  if (snapshot.H1.pendingHigh) {
    console.log(`  Pending high: price=${snapshot.H1.pendingHigh.price}`);
  }
  if (snapshot.H1.pendingLow) {
    console.log(`  Pending low: price=${snapshot.H1.pendingLow.price}`);
  }
});

const finalSnapshot = engine.getSnapshot();
console.log('\n=== Final Result ===');
console.log('Confirmed swing highs:', finalSnapshot.H1.swingHighs.length);
console.log('Confirmed swing lows:', finalSnapshot.H1.swingLows.length);

if (finalSnapshot.H1.swingHighs.length > 0) {
  console.log('\nFirst swing high:', finalSnapshot.H1.swingHighs[0]);
}

// Expected: Bar 1 (high=4520) should be detected as swing high
// because it's higher than 2 bars before (bar 0: 4505) and 2 bars after (bars 2,3: 4518, 4515)
console.log('\n=== Expected ===');
console.log('Bar 1 (high=4520) should be swing HIGH because:');
console.log('  Left check: 4520 > 4505 (bar 0)');
console.log('  Right check: 4520 > 4518 (bar 2) and 4520 > 4515 (bar 3)');
console.log('  Confirmation: bar 4 provides confirmation');
