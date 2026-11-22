/// <reference types="@cloudflare/workers-types" />

// Ambient declarations for the vendored old-filesystem server (plain JS, no types shipped).
declare module "*/vendor-filesystem/filesystem.js" {
  export const server: import("@modelcontextprotocol/sdk/server/index.js").Server;
  const allowedDirectories: string[];
  export { allowedDirectories };
}
declare module "*/vendor-filesystem/diff.js" {
  export function createTwoFilesPatch(
    oldFileName: string,
    newFileName: string,
    oldStr: string,
    newStr: string,
    oldHeader?: string,
    newHeader?: string,
    options?: unknown
  ): string;
}
declare module "*/vendor-filesystem/local-minimatch.js" {
  export function minimatch(path: string, pattern: string, options?: Record<string, unknown>): boolean;
  const mm: typeof minimatch & { AST: unknown };
  export default mm;
}
declare module "*/vendor-filesystem/path-validation.js" {
  export function isPathWithinAllowedDirectories(absolutePath: string, allowedDirectories: string[]): boolean;
}