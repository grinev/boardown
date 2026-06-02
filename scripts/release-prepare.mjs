#!/usr/bin/env node

// Prepares a release commit: bumps the root version, mirrors it into every
// workspace package (lockstep), and commits `chore(release): v<version>`.
// Does NOT create a git tag — the publish workflow does that after a build.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { syncVersions } from "./sync-versions.mjs";

const isWindows = process.platform === "win32";
const semverInputPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

const validBumps = new Set([
  "major",
  "minor",
  "patch",
  "premajor",
  "preminor",
  "prepatch",
  "prerelease",
]);

function run(command, args, shell = false) {
  const result = spawnSync(command, args, { stdio: "inherit", shell });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
}

function printUsage() {
  process.stdout.write(
    [
      "Usage:",
      "  pnpm release:prepare <version-or-bump>",
      "",
      "Examples:",
      "  pnpm release:prepare 0.2.0",
      "  pnpm release:prepare patch",
      "  pnpm release:rc",
      "",
      "Notes:",
      "  - Updates the root package.json and mirrors the version into all packages",
      "  - Creates commit: chore(release): v<version>",
      "  - Does not create a git tag (the publish workflow tags after building)",
    ].join("\n") + "\n",
  );
}

const input = process.argv[2];

if (!input || input === "-h" || input === "--help") {
  printUsage();
  process.exit(0);
}

const npmVersionArgs = ["version"];

if (input === "rc") {
  npmVersionArgs.push("prerelease", "--preid=rc");
} else if (validBumps.has(input)) {
  npmVersionArgs.push(input);
} else if (semverInputPattern.test(input)) {
  npmVersionArgs.push(input);
} else {
  process.stderr.write(`Invalid release input: ${input}. Use a bump keyword or semver value.\n`);
  printUsage();
  process.exit(2);
}

npmVersionArgs.push("--no-git-tag-version");

const packageJsonPath = resolve(process.cwd(), "package.json");
const versionBefore = JSON.parse(readFileSync(packageJsonPath, "utf8")).version;

if (semverInputPattern.test(input) && input === versionBefore) {
  process.stdout.write(`Version is already ${versionBefore}, skipping npm version step\n`);
} else {
  // npm on Windows is a .cmd shim; spawn it through the shell there.
  run("npm", npmVersionArgs, isWindows);
}

const { version } = syncVersions();

run("git", ["add", "package.json", "packages/*/package.json"]);
run("git", ["commit", "-m", `chore(release): v${version}`]);

process.stdout.write(`Prepared release commit for v${version}\n`);
process.stdout.write("Next step: git push origin main\n");
