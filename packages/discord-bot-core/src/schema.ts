export interface CommandOption {
  name: string;
  description: string;
  type: 'string' | 'integer' | 'boolean';
  required?: boolean;
}

export interface Command {
  name: string;
  description: string;
  options?: CommandOption[];
}

export interface Manifest {
  commands: Command[];
}

export function normalizeManifest(m: Manifest): Manifest {
  const commands = [...(m.commands || [])]
    .map(c => ({ ...c, options: c.options ? [...c.options].sort((a,b)=>a.name.localeCompare(b.name)) : undefined }))
    .sort((a,b)=>a.name.localeCompare(b.name));
  return { commands };
}

