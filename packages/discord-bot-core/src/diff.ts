import type { Manifest } from './schema.js';

export interface DiffEntry {
  type: 'added' | 'removed' | 'modified';
  path: string; // e.g., commands[name]
  detail?: string;
}

export function diffManifests(local: Manifest, deployed: Manifest): DiffEntry[] {
  const diffs: DiffEntry[] = [];
  const lmap = new Map(local.commands.map(c => [c.name, c]));
  const dmap = new Map(deployed.commands.map(c => [c.name, c]));
  for (const [name, lc] of lmap) {
    if (!dmap.has(name)) diffs.push({ type: 'added', path: `commands[${name}]` });
    else {
      const dc = dmap.get(name)!;
      const ljson = JSON.stringify(lc);
      const djson = JSON.stringify(dc);
      if (ljson !== djson) diffs.push({ type: 'modified', path: `commands[${name}]` });
    }
  }
  for (const [name] of dmap) {
    if (!lmap.has(name)) diffs.push({ type: 'removed', path: `commands[${name}]` });
  }
  return diffs;
}

