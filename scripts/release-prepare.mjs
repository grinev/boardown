#!/usr/bin/env node

// Prepares a release commit: bumps the root version, mirrors it into every
// workspace package (lockstep), and commits `chore(release): v<version>`.
// Does NOT create a git tag — the publish workflow does that after a build.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

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

function resolveRepository() {
  if (process.env.GITHUB_REPOSITORY) {
    return process.env.GITHUB_REPOSITORY;
  }

  const repositoryField = JSON.parse(readFileSync(packageJsonPath, "utf8")).repository;
  const url = typeof repositoryField === "string" ? repositoryField : repositoryField?.url;
  const match = typeof url === "string" ? url.match(/github\.com[/:]([^/]+\/[^/.]+)(?:\.git)?$/i) : null;

  return match ? match[1] : "";
}

// Seed a curated release-notes file for a stable version, prefilled with the
// same auto-generated content the publish workflow would produce. It rides in
// the release commit so it can be hand-edited (amend) before pushing; the
// workflow uses it verbatim when present. RC releases keep pure CI generation.
function seedReleaseNotes(version) {
  const notesDir = resolve(process.cwd(), "docs", "release-notes");
  const notesPath = join(notesDir, `v${version}.md`);
  const relPath = relative(process.cwd(), notesPath);

  if (existsSync(notesPath)) {
    process.stdout.write(`Release notes already exist at ${relPath}, keeping them\n`);
    return notesPath;
  }

  const repository = resolveRepository();

  if (!repository) {
    process.stderr.write(
      "Could not resolve the GitHub repository; skipping release-notes seed. " +
        "Set GITHUB_REPOSITORY or a repository.url in package.json.\n",
    );
    return null;
  }

  mkdirSync(notesDir, { recursive: true });
  run(process.execPath, [
    resolve(process.cwd(), "scripts", "generate-release-notes.mjs"),
    "--version",
    version,
    "--kind",
    "stable",
    "--repo",
    repository,
    "--output",
    notesPath,
  ]);
  process.stdout.write(`Seeded release notes at ${relPath}\n`);

  return notesPath;
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
      "  - For a stable version, seeds docs/release-notes/v<version>.md (edit it,",
      "    then `git commit --amend` before pushing; the workflow uses it verbatim)",
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

const isStable = /^\d+\.\d+\.\d+$/.test(version);
const notesPath = isStable ? seedReleaseNotes(version) : null;

const addTargets = ["package.json", "packages/*/package.json"];
if (notesPath) {
  addTargets.push(relative(process.cwd(), notesPath));
}

run("git", ["add", ...addTargets]);
run("git", ["commit", "-m", `chore(release): v${version}`]);

process.stdout.write(`Prepared release commit for v${version}\n`);
if (notesPath) {
  const relPath = relative(process.cwd(), notesPath);
  process.stdout.write(`Edit ${relPath}, then: git commit --amend --no-edit\n`);
}
process.stdout.write("Next step: git push origin main\n");
