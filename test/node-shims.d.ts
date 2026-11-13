// Minimale typer for Node's indbyggede testværktøjer (så vi ikke behøver @types/node).
declare module "node:test" {
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function describe(name: string, fn: () => void): void;
}
declare module "node:assert/strict" {
  const assert: {
    equal(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): void;
  };
  export default assert;
}
declare module "node:fs" {
  export function readFileSync(path: string | URL, encoding: "utf8"): string;
}
