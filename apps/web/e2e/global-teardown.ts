import { execSync } from "node:child_process";
import { resolve } from "node:path";

/** Removes the accounts and bookings the browser tests created. */
export default function globalTeardown() {
  execSync("pnpm --filter api exec tsx scripts/cleanup-browser-tests.ts", {
    cwd: resolve(__dirname, "../../.."),
    stdio: "inherit",
  });
}
