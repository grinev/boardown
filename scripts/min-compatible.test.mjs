import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";

import {
  FORMAT_FILES,
  compareSemver,
  decideMinCompatible,
  formatFilesChangedSince,
  previousReleaseTag,
} from "./min-compatible.mjs";

describe("decideMinCompatible", () => {
  it("leaves the constant when the format files did not change", () => {
    assert.deepEqual(
      decideMinCompatible({ current: "0.9.0", version: "0.10.0", formatChanged: false }),
      { kind: "leave", value: "0.9.0" },
    );
  });

  it("sets the constant to the version being released when they did", () => {
    assert.deepEqual(
      decideMinCompatible({ current: "0.9.0", version: "0.10.0", formatChanged: true }),
      { kind: "set", value: "0.10.0" },
    );
  });

  it("stops when the constant is already higher than the version being released", () => {
    assert.deepEqual(
      decideMinCompatible({ current: "0.11.0", version: "0.10.0", formatChanged: true }),
      { kind: "stop", reason: "already-higher", current: "0.11.0", version: "0.10.0" },
    );
  });
});

describe("compareSemver", () => {
  it("compares major, then minor, then patch, ignoring a suffix", () => {
    assert.equal(compareSemver("0.11.0", "0.11.0"), 0);
    assert.equal(compareSemver("0.11.0-rc.1", "0.11.0"), 0);
    assert.ok(compareSemver("0.11.1", "0.11.0") > 0);
    assert.ok(compareSemver("0.10.9", "0.11.0") < 0);
  });
});

const git = (cwd, args) => spawnSync("git", args, { cwd, encoding: "utf8" });

const tempRepo = () => {
  const dir = mkdtempSync(join(tmpdir(), "bd-min-compat-"));
  git(dir, ["init"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
  for (const file of FORMAT_FILES) {
    mkdirSync(join(dir, dirname(file)), { recursive: true });
    writeFileSync(join(dir, file), "original\n", "utf8");
  }
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-m", "initial", "--no-verify"]);
  git(dir, ["tag", "v0.8.0"]);
  return dir;
};

describe("previousReleaseTag and formatFilesChangedSince", () => {
  it("reads the tag and reports unchanged / changed / missing", () => {
    const dir = tempRepo();
    try {
      const runGit = (args) => git(dir, args);
      assert.equal(previousReleaseTag(runGit), "v0.8.0");
      assert.equal(formatFilesChangedSince("v0.8.0", runGit), false);

      writeFileSync(join(dir, FORMAT_FILES[0]), "changed\n", "utf8");
      assert.equal(formatFilesChangedSince("v0.8.0", runGit), true);

      const empty = mkdtempSync(join(tmpdir(), "bd-min-compat-empty-"));
      try {
        git(empty, ["init"]);
        assert.equal(previousReleaseTag((args) => git(empty, args)), null);
      } finally {
        rmSync(empty, { recursive: true, force: true });
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
