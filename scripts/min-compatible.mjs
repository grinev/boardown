export const FORMAT_FILES = [
  "packages/core/src/schemas.ts",
  "packages/core/src/serializer.ts",
  "packages/core/src/parser.ts",
  "packages/core/src/loader.ts",
];

export function compareSemver(left, right) {
  const parts = (value) => {
    const match = /^(\d+)\.(\d+)\.(\d+)/.exec(value);
    if (!match) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
  };
  const a = parts(left);
  const b = parts(right);
  if (a === null || b === null) {
    throw new Error(`not a major.minor.patch version: ${left} / ${right}`);
  }
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return 1;
    if (a[i] < b[i]) return -1;
  }
  return 0;
}

export function decideMinCompatible({ current, version, formatChanged }) {
  if (compareSemver(current, version) > 0) {
    return { kind: "stop", reason: "already-higher", current, version };
  }
  if (formatChanged) {
    return { kind: "set", value: version };
  }
  return { kind: "leave", value: current };
}

export function previousReleaseTag(runGit) {
  const result = runGit(["describe", "--tags", "--abbrev=0", "--match", "v*"]);
  if (result.status !== 0) return null;
  const tag = String(result.stdout ?? "").trim();
  return tag.length === 0 ? null : tag;
}

export function formatFilesChangedSince(tag, runGit) {
  const result = runGit(["diff", tag, "--", ...FORMAT_FILES]);
  if (typeof result.status === "number" && result.status !== 0) {
    throw new Error(`git diff against ${tag} failed`);
  }
  return String(result.stdout ?? "").trim().length > 0;
}
