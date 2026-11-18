/** Shared test helpers (Node-only; never imported by browser code). */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const UPLOADS = '/mnt/user-data/uploads';

export const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

/** Recursively list files under a project-relative dir. */
export function walk(rel: string, filter: (path: string) => boolean = () => true): string[] {
  const out: string[] = [];
  for (const d of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
    const p = `${rel}/${d.name}`;
    if (d.isDirectory()) out.push(...walk(p, filter));
    else if (filter(p)) out.push(p);
  }
  return out;
}
