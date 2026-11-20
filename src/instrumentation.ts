export async function register() {
  // The boot code is Node-only; behind this check the Edge build leaves it out.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNode } = await import("./instrumentation-node");
    await registerNode();
  }
}
