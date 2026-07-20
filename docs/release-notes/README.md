# Release notes

Curated release notes, one file per stable version: `v<version>.md`.

`pnpm release:prepare <version>` seeds `v<version>.md` for a stable release,
prefilled with the same notes the publish workflow would auto-generate, and
includes it in the `chore(release)` commit. Edit the file and fold the change
back into that commit with `git commit --amend --no-edit` before pushing —
a separate commit would leak into the next release's notes.

The [`Release`](../../.github/workflows/release.yml) workflow uses the file
verbatim as the GitHub Release body when it exists, and falls back to
generating notes from the commit log when it does not. RC prereleases are
never seeded and always generate.
