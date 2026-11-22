// Dynamic-Worker target for @cloudflare/codemode's DynamicWorkerExecutor.
//
// The executor generates a JS bundle at runtime and invokes this Worker
// with `bundle`, `source`, `modules` etc. through env.LOADER(...). The
// runtime then evaluates the bundle inside the Worker and exposes an
// RpcTarget whose method `evaluate(dispatcher, code)` runs the code in
// the sandbox with the dispatcher available as `codemode`.
//
// The entrypoint is effectively a no-op from our perspective; the only
// requirement is that this Worker's name matches the LOADER binding in
// ../wrangler.jsonc and that it can accept the dispatch calls.

// The runtime calls `default.evaluate(...)` on a Worker defined this way:
// it's the "evaluator" contract DynamicWorkerExecutor uses. `env` comes
// from the dynamic-dispatch payload, `dispatcher` is an RpcTarget that
// routes `codemode.*` calls back to the host, and `code` is the source
// the model generated. We re-export the default evaluator so the runtime
// can find it regardless of how it introspects the Worker module.

export default {
  // Fallback for direct HTTP requests (usually nobody).
  async fetch(request) {
    return new Response(
      "Sandbox host for kimi-codemode-filesystem. Call /mcp on the main Worker.",
      { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }
}

// Standard evaluator shape. The actual sandbox bundle (injected at
// dispatch time) defines its own `evaluate`; this symbol export is what
// tells the runtime the module follows the dynamic-dispatch contract.
export const __dynamic_dispatch__ = true;