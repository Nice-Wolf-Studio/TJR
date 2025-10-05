const { HtfSwings } = require('./dist/htf-swings.js');

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
  { timestamp: new Date('2024-01-15T13:00:00Z').getTime(), open: 4512, high: 4515, low: 4508, close: 4510, volume: 1000 }  // Confirms peak
];

console.log('Processing bars...');
bars.forEach((bar, i) => {
  console.log(`\nBar ${i}:`, bar);
  engine.onBar(bar);
  const snapshot = engine.getSnapshot();
  console.log(`After bar ${i}: ${snapshot.H1.swingHighs.length} highs, ${snapshot.H1.swingLows.length} lows`);
  if (snapshot.H1.pendingHigh) {
    console.log('  Pending high:', snapshot.H1.pendingHigh.price);
  }
  if (snapshot.H1.pendingLow) {
    console.log('  Pending low:', snapshot.H1.pendingLow.price);
  }
});

const finalSnapshot = engine.getSnapshot();
console.log('\n=== Final Result ===');
console.log('Swing highs:', finalSnapshot.H1.swingHighs.length);
console.log('Swing lows:', finalSnapshot.H1.swingLows.length);

if (finalSnapshot.H1.swingHighs.length > 0) {
  console.log('First swing high:', finalSnapshot.H1.swingHighs[0]);
}
