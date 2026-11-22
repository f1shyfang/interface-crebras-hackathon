// vendor-filesystem/filesystem.js
//
// Thin shim that instantiates the upstream @modelcontextprotocol/server-filesystem
// server and re-exports it as `server`.  Allowed directories start empty; the
// SDK's MCP Roots handshake (or the LOADER sandbox environment) fills them in
// at runtime.  This matches how the upstream CLI works: it calls createServer([])
// and then lets the client's initialize/roots/list_changed flow supply the
// allowed directories.
import { createServer } from "@modelcontextprotocol/server-filesystem/dist/server.js";

// No command-line directories on a Worker; the client must supply roots via MCP.
export const server = createServer([]);
