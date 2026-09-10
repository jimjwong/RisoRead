#!/usr/bin/env node
/**
 * Run the dev server so it works from another machine on your tailnet.
 *
 * The catch this solves: NEXT_PUBLIC_SUPABASE_URL is compiled into the browser
 * bundle. Left at 127.0.0.1, a remote browser resolves it to *its own*
 * localhost, so the page renders and then every request fails — which looks
 * like a broken app rather than a misconfiguration.
 *
 *   npm run dev:remote              # auto-detect the Tailscale address
 *   npm run dev:remote -- 100.x.y.z # or name it explicitly
 *   npm run dev:remote -- 100.x.y.z --port 4000
 *   npm run dev:remote -- --prod    # production build (see below)
 *
 * Use --prod when testing on a phone over plain http.
 *
 * `crypto.randomUUID` and `crypto.subtle` only exist in a *secure context* —
 * https, or localhost. Next's dev overlay calls them, so over http://<tailnet>
 * it throws during startup and React never hydrates: the page renders, and
 * every button on it is dead. Desktop hides this because localhost counts as
 * secure. A production build ships no dev overlay and has the problem nowhere.
 *
 * The real fix is https. Tailscale issues certs for .ts.net names once you
 * enable HTTPS Certificates in the admin console, after which
 * `tailscale serve --bg --https=443 3210` gives a proper secure origin.
 */

import { spawn, spawnSync, execSync } from "node:child_process";
import { networkInterfaces } from "node:os";
import { rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const explicit = args.find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a));
const portFlag = args.indexOf("--port");
const port = portFlag !== -1 ? args[portFlag + 1] : "3210";
const prod = args.includes("--prod");

/**
 * Tailscale hands out addresses in 100.64.0.0/10 (CGNAT). Prefer that over a
 * LAN address: it works from anywhere, survives changing networks, and is
 * already authenticated to your devices only.
 */
function detectHost() {
  if (explicit) return explicit;

  try {
    const ip = execSync("tailscale ip -4", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .trim()
      .split("\n")[0];
    if (ip) return ip;
  } catch {
    // Tailscale CLI not on PATH — fall through to interface scan.
  }

  const candidates = [];
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== "IPv4" || a.internal) continue;
      const second = Number(a.address.split(".")[1]);
      const isTailscale = a.address.startsWith("100.") && second >= 64 && second <= 127;
      candidates.push({ address: a.address, isTailscale });
    }
  }

  const tailnet = candidates.find((c) => c.isTailscale);
  return tailnet?.address ?? candidates[0]?.address ?? null;
}

const host = detectHost();

if (!host) {
  console.error(
    "No reachable address found.\n" +
      "Start Tailscale, or pass one: npm run dev:remote -- 192.168.1.50",
  );
  process.exit(1);
}

const supabaseUrl = `http://${host}:54321`;

// A per-start marker, shown small on the login page. When you're testing on a
// phone you can't open devtools on, "is this actually the new build?" is the
// first question worth answering, and a stale page in a backgrounded tab looks
// identical to a broken one.
const startedAt = new Date();
const buildStamp = `${String(startedAt.getHours()).padStart(2, "0")}:${String(
  startedAt.getMinutes(),
).padStart(2, "0")}`;

/**
 * Drop the build cache when any injected public value changes.
 *
 * NEXT_PUBLIC_* values are inlined into client chunks at compile time, and the
 * bundler will happily reuse a chunk compiled under the previous value. The
 * symptom is nasty: the app loads fine and every request goes to the *old*
 * host, so switching between local and remote appears to work and then fails
 * on the first query. Rebuilding costs a few seconds; debugging this costs an
 * afternoon.
 */
const stampFile = join(".next", "cache", ".riso-public-env");
// Stamp *every* public value this script injects, not just the URL. Stamping
// one of them means adding a second silently reuses chunks compiled without
// it, which is the same class of bug this guard exists to prevent.
const stamp = JSON.stringify({ supabaseUrl, buildStamp });

if (existsSync(".next")) {
  let previous = null;
  try {
    previous = readFileSync(stampFile, "utf8");
  } catch {
    // No stamp — a cache built before this script existed. Treat as stale.
  }
  if (previous !== stamp) {
    console.log("  Public env changed — clearing .next so chunks rebuild.\n");
    rmSync(".next", { recursive: true, force: true });
  }
}

mkdirSync(join(".next", "cache"), { recursive: true });
writeFileSync(stampFile, stamp);

/**
 * Hand the override to Next through a file, not the process environment.
 *
 * `@next/env` re-applies .env files over process.env on startup, so an
 * inherited NEXT_PUBLIC_SUPABASE_URL gets silently reverted to whatever
 * .env.local says. Next's documented precedence puts .env.development.local
 * above .env.local, so writing it there wins cleanly and leaves .env.local
 * untouched for ordinary local work.
 */
// `next build` reads .env.production.local, `next dev` reads
// .env.development.local. Write whichever this run needs.
const overrideFile = prod ? ".env.production.local" : ".env.development.local";

writeFileSync(
  overrideFile,
  `# Generated by scripts/dev-remote.mjs — deleted when the server stops.\n` +
    `# Overrides .env.local so the browser bundle points at this machine\n` +
    `# rather than the viewing device's own localhost.\n` +
    `NEXT_PUBLIC_SUPABASE_URL=${supabaseUrl}\n` +
    `NEXT_PUBLIC_BUILD_STAMP=${buildStamp}\n`,
);

let cleanedUp = false;
function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  try {
    rmSync(overrideFile, { force: true });
  } catch {
    // Nothing to do — the file is gitignored and rewritten on every run.
  }
}
process.on("exit", cleanup);

console.log(`
  RisoDesk — remote dev

    App        http://${host}:${port}
    Supabase   ${supabaseUrl}
    Studio     http://${host}:54323

  Build ${buildStamp}${prod ? " · production, no dev overlay" : ""} — shown on the login page, so you can tell a stale
  phone tab from a broken one. Reload the device if it disagrees.

  Open the app URL from any device on your tailnet.
  Ctrl-C to stop.
`);

// Run Next's entry script under this Node directly, rather than going through
// the `npx`/`next` shims. On Windows those are `.cmd` files, which Node refuses
// to spawn without a shell (EINVAL) — and spawning through a shell concatenates
// arguments instead of escaping them, which Node now warns about.
const nextBin = join("node_modules", "next", "dist", "bin", "next");

if (!existsSync(nextBin)) {
  console.error(`Can't find Next at ${nextBin}. Run npm install first.`);
  cleanup();
  process.exit(1);
}

if (prod) {
  console.log("  Building for production (no dev overlay)…\n");
  const build = spawnSync(process.execPath, [nextBin, "build"], {
    stdio: "inherit",
  });
  if (build.status !== 0) {
    cleanup();
    process.exit(build.status ?? 1);
  }
}

const child = spawn(
  process.execPath,
  prod
    ? [nextBin, "start", "--port", port, "--hostname", "0.0.0.0"]
    : [nextBin, "dev", "--port", port, "--hostname", "0.0.0.0"],
  { stdio: "inherit" },
);

child.on("exit", (code) => {
  cleanup();
  process.exit(code ?? 0);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    cleanup();
    child.kill(sig);
  });
}
