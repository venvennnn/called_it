import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
mkdirSync(".data", { recursive: true });
for (const suffix of ["", "-wal", "-shm"])
  rmSync(".data/e2e.sqlite" + suffix, { force: true });
const child = spawn(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", "dev"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      APP_MODE: "demo",
      NODE_ENV: "development",
      APP_ORIGIN: "http://localhost:5174",
      WEB_PORT: "5174",
      PORT: "3002",
      API_PROXY: "http://127.0.0.1:3002",
      DATABASE_PATH: ".data/e2e.sqlite",
    },
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    child.kill(signal);
  });
child.on("exit", (code) => process.exit(code || 0));
