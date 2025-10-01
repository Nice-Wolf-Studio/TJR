#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { normalizeManifest, type Manifest } from '../schema.js';
import { diffManifests } from '../diff.js';

function load(path: string): Manifest {
  const raw = readFileSync(path, 'utf-8');
  return JSON.parse(raw);
}

function main() {
  const args = process.argv.slice(2);
  const localPath = args.find(a => a.startsWith('--local='))?.slice(8);
  const deployedPath = args.find(a => a.startsWith('--deployed='))?.slice(11);
  const pretty = args.includes('--pretty');
  if (!localPath || !deployedPath) {
    console.error(JSON.stringify({ success:false, error:'--local and --deployed required' }));
    process.exit(2);
  }
  try {
    const local = normalizeManifest(load(localPath));
    const deployed = normalizeManifest(load(deployedPath));
    const diffs = diffManifests(local, deployed);
    const result = { success:true, command:'discord-registrar', timestamp:new Date().toISOString(), data:{ diffs } };
    if (pretty) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(JSON.stringify(result));
    }
    process.exit(diffs.length > 0 ? 1 : 0);
  } catch (e:any) {
    console.error(JSON.stringify({ success:false, error:e?.message || 'unknown' }));
    process.exit(2);
  }
}

main();

