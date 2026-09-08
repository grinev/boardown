#!/usr/bin/env node

// Mirrors the root package.json version and minCompatibleVersion into every
// workspace package so the whole monorepo ships under one lockstep version.
// Source of truth: root.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const rootDir = resolve(process.cwd());
const packagesDir = join(rootDir, "packages");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function syncVersions() {
  const rootPackagePath = join(rootDir, "package.json");
  const root = readJson(rootPackagePath);
  const version = root.version;
  const minCompatibleVersion = root.minCompatibleVersion;

  if (!version) {
    process.stderr.write("Root package.json has no version field\n");
    process.exit(1);
  }

  if (!minCompatibleVersion) {
    process.stderr.write("Root package.json has no minCompatibleVersion field\n");
    process.exit(1);
  }

  const updated = [];

  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const packagePath = join(packagesDir, entry.name, "package.json");
    let pkg;

    try {
      pkg = readJson(packagePath);
    } catch {
      continue;
    }

    const versionChanged = pkg.version !== version;
    const minChanged = pkg.minCompatibleVersion !== minCompatibleVersion;
    if (!versionChanged && !minChanged) {
      continue;
    }

    pkg.version = version;
    pkg.minCompatibleVersion = minCompatibleVersion;
    writeJson(packagePath, pkg);
    updated.push(`packages/${entry.name}`);
  }

  return { version, minCompatibleVersion, updated };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { version, updated } = syncVersions();
  if (updated.length === 0) {
    process.stdout.write(`All packages already at v${version}\n`);
  } else {
    process.stdout.write(`Synced to v${version}: ${updated.join(", ")}\n`);
  }
}
