// The entry of the compiled bridge of a downloaded app: one binary is the bridge, and with --acp-host the ACP host
// (acp-host.ts). From source, the app starts main.ts and the bridge starts acp-host.ts, each with bun.
if (process.argv.includes("--acp-host")) await import("./acp-host");
else await import("./main");

export {};
