/**
 * Minimal ambient declarations for the Node built-ins used by tests, so the
 * test tsconfig typechecks without @types/node (no dependencies allowed).
 * Extend here if a test needs more; keep signatures honest.
 */
declare module 'node:test' {
  type Fn = (t: TestContext) => void | Promise<void>;
  interface TestContext {
    test(name: string, fn: Fn): Promise<void>;
    skip(message?: string): void;
    diagnostic(message: string): void;
  }
  export function test(name: string, fn: Fn): Promise<void>;
  export function test(name: string, options: { skip?: boolean | string }, fn: Fn): Promise<void>;
  export function describe(name: string, fn: () => void | Promise<void>): Promise<void>;
  export function it(name: string, fn: Fn): Promise<void>;
  export function before(fn: () => void | Promise<void>): void;
  export function after(fn: () => void | Promise<void>): void;
  export function beforeEach(fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;
}

declare module 'node:assert/strict' {
  interface Assert {
    (value: unknown, message?: string): asserts value;
    ok(value: unknown, message?: string): asserts value;
    equal<T>(actual: unknown, expected: T, message?: string): asserts actual is T;
    notEqual(actual: unknown, expected: unknown, message?: string): void;
    deepEqual<T>(actual: unknown, expected: T, message?: string): asserts actual is T;
    notDeepEqual(actual: unknown, expected: unknown, message?: string): void;
    match(value: string, re: RegExp, message?: string): void;
    doesNotMatch(value: string, re: RegExp, message?: string): void;
    throws(fn: () => unknown, expected?: RegExp | ((err: unknown) => boolean), message?: string): void;
    fail(message?: string): never;
  }
  const assert: Assert;
  export default assert;
}

declare module 'node:crypto' {
  interface Hash {
    update(data: string | Uint8Array): Hash;
    digest(encoding: 'hex'): string;
  }
  export function createHash(algorithm: string): Hash;
}

declare module 'node:fs' {
  interface Stats {
    isFile(): boolean;
    isDirectory(): boolean;
    size: number;
  }
  interface Dirent {
    name: string;
    isFile(): boolean;
    isDirectory(): boolean;
  }
  export function readFileSync(path: string): Uint8Array & { readUInt32LE(offset: number): number; toString(enc?: string): string };
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function existsSync(path: string): boolean;
  export function statSync(path: string): Stats;
  export function readdirSync(path: string, opts: { withFileTypes: true }): Dirent[];
  export function readdirSync(path: string): string[];
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
  export function dirname(p: string): string;
  export function relative(from: string, to: string): string;
  export function extname(p: string): string;
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}

interface ImportMeta {
  readonly url: string;
}
