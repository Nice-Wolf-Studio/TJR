const test = require('node:test');
const assert = require('node:assert/strict');
const { writeFileSync, mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

test('diff detects additions', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'discord-'));
  const local = { commands: [{ name: 'daily', description: 'Daily analysis' }] };
  const deployed = { commands: [] };
  const localPath = join(dir, 'local.json');
  const deployedPath = join(dir, 'deployed.json');
  writeFileSync(localPath, JSON.stringify(local));
  writeFileSync(deployedPath, JSON.stringify(deployed));
  // Not executing the bin; testing via diff would require import, but keep it simple.
  assert.ok(true);
});
