---
name: prepare-release
description: Prepare a boardown release locally — take the version from the current release on the board, bump it, curate the GitHub release notes, update the VS Code Marketplace docs, close the release on the board, run the gates, and land it all in a single chore(release) commit. Stops before pushing. Use when cutting a release (the human asks to prepare the next release, or names vX.Y.Z).
---

# Preparing a release

This skill takes a boardown release from "the code for it is merged on `main`" to
"a single `chore(release): v<version>` commit is ready, gates green, nothing
pushed". The human reviews and pushes; pushing is what actually triggers the
`Release` workflow, so it is never your call.

`pnpm release:prepare` deliberately **does not commit** — it only bumps the
version and seeds a notes draft. You curate everything, then make **one** commit.
That is the whole point: no amend dance, and the release notes plus the
Marketplace docs all land together, reviewed, in the same commit.

## The flow

1. **Take the version from the board.** boardown dog-foods its own board, and the
   release being cut is the **current** release in `.boardown/` — its name
   (`v0.6.0`) *is* the version. Run `boardown release current` and read it off.
   Two hard stops, checked **before anything is written**:
   - **No current release** — there is nothing to cut.
   - **Open tasks in it** — anything whose status is not `done`.

   In either case, tell the human what you found (name the open tasks), do **not**
   run `pnpm release:prepare`, and do **not** touch a `package.json`. Finishing the
   tasks or overriding the check is their call, not yours. If the human asked for a
   version that disagrees with the board, stop and ask — one of the two is wrong.
2. **Bump + seed.** Run `pnpm release:prepare <version>` with the version from
   step 1 (e.g. `0.6.0`). It updates the root `package.json`, mirrors the version
   into every package, and seeds `docs/release-notes/v<version>.md` with an
   auto-generated draft. Nothing is committed or tagged. Note the previous tag
   (`git describe --tags --abbrev=0`).
3. **Curate the release notes** — rewrite the seeded file (see below).
4. **Update the sibling docs** — the VS Code Marketplace listing, and the main
   README if a headline capability changed (see below).
5. **Close the release on the board** — `boardown release done v<version>`, which
   flips it to `finished`. By step 1 every task in it is already `done`, so nothing
   carries over. Do not start the next release; that is the human's call.
6. **Run the gates** — `pnpm lint && pnpm typecheck && pnpm build && pnpm test`
   from the repo root. A release commit must be green.
7. **Commit, do not push** — see "The commit" at the end.

## Curating the release notes

The notes are the **user-facing** description of the release: what someone who
installed the VS Code extension, the desktop app or the CLI actually gets. They
live one file per version at `docs/release-notes/v<version>.md`, and the
[`Release`](../../../.github/workflows/release.yml) workflow publishes that file
**verbatim** as the GitHub Release body when it is present — falling back to
generating notes from the commit log when it is absent. So they are not a
changelog of commits and not an internal work log; the seeded draft (commit
subjects grouped by type) is raw material, replace it.

### The organising axis: surface, not commit type

boardown ships one product through several shells, and they all mount the same
`@boardown/ui`. So the question a reader has is "what changed on the surface I
use?", not "which commit type was it". Group by **surface**:

- **Board** — anything in the shared board UI (`packages/ui` / `packages/core`):
  a change here shows up in every shell at once. Most entries live here. Never
  call this section "Core" — `packages/core` is the non-UI logic layer and the
  name collides.
- **Desktop** — Electron-only: the app window, native menus, the About window,
  installers.
- **VS Code Extension** — extension-only: the Settings dialog row, host
  integration, activation, the `.vsix`.
- **CLI** — `@grinev/boardown-cli`: commands, flags, the JSON envelope.
- **Technical** — developer-facing changes with no user-visible effect but worth
  recording for someone working on boardown (e.g. dev logging). Keep it short;
  drop it entirely if there is nothing real to say.

Emit only the sections that have entries. Order them Board → Desktop → VS Code
Extension → CLI → Technical.

**A cross-shell change is listed under each surface it reaches, described the way
it appears there.** "App version in Settings" is a Settings row in VS Code but a
native About window on Desktop — two entries, each true for its surface, not one
merged line. Deciding where a change belongs is a matter of *where the user sees
it*, which is often not where the code lives: a feature implemented in
`packages/ui` but only reachable from one shell is that shell's entry, not Board.

### Each entry

- Lead with a **bold feature name**, then an em-dash, then **one sentence** on
  what the user can now do. Keep it tight — this is a highlight list, not
  documentation. Write for someone who has never read the code.
- Describe the **behaviour**, not the implementation. "Reference a doc page from
  a task and click through to it", not "added a remark plugin for `[[ ]]` tokens".
- Name real, user-facing identifiers when they are the point — a CLI command
  (`release current`), a flag (`--full`), a visible label. Skip file and module
  names entirely.
- No attribution lines, no PR numbers in the body.

### What to leave out

Not every commit earns a line. The notes are for people who *use* a shipped
shell, so exclude anything that only touches the person maintaining the repo:

- **Release plumbing** — the release pipeline, version bumps, CI, build scripts.
- **Docs and repo hygiene** — README / PRODUCT.md / CLAUDE.md edits, board data
  under `.boardown/`, formatting, lint config.
- **Pure internal refactors** with no behaviour change on any surface.

The **Technical** section is a narrow exception for developer-facing changes a
*contributor* would want to know about (dev logging, a new test harness) — not a
dumping ground for the maintainer-only plumbing above. When unsure: would anyone
who did not write this release care? If only the author would, drop it.

### Sourcing the material

**The commit log is the spine.** `git log --no-merges v<prev>..HEAD` is the only
complete record of what shipped — not everything that lands gets a task, so the
board's release is a hint about intent, never the list of changes. Walk the
commits and let the board fill in the *why*, not the other way round.

Do not paraphrase commit subjects either — they are lossy. For each real change,
pull the accurate description from:

- `.claude/specs/<slug>/product.md` — its *Look* and *Behaviour* lines are
  already written in user terms, one observable decision each. This is the best
  source.
- `git log --no-merges v<prev>..HEAD` with `--name-only` to see which package
  each commit touched, which tells you the surface.
- `boardown release get v<version> --full` — task titles and descriptions for the
  work that *was* tracked. Cross-check, never a substitute for the log.
- `PRODUCT.md` when a change shifted the product's described behaviour.

`chore(release):` and `chore(board):` commits are always out, and most
`chore:`/`refactor:`/`docs:`/`test:` churn is too.

### Wrapper

Keep the auto-seeded first and last lines:

- Title: `## Release v<version>` as the first line.
- Footer: `Full changelog: https://github.com/grinev/boardown/compare/v<prev>...v<version>`
  as the last line.

Between them go the surface sections.

## Updating the sibling docs

The GitHub release notes are not the only per-release document. Update these in
the same commit; they are maintained by hand and easy to forget.

- **`packages/vscode/CHANGELOG.md`** — shown as the **Changelog** tab on the VS
  Code Marketplace. Add a `## <version>` section (newest first) with the changes a
  **VS Code user** sees — Board / VS Code Extension entries only. CLI-, Desktop-
  and Technical-only items do not belong here.
- **`packages/vscode/README.md`** — the Marketplace listing. If the release adds a
  headline user-facing capability, add or extend a bullet in its **Features** list.
  Minor changes need no bullet. Images here must use absolute
  `raw.githubusercontent.com/.../main/...` URLs — relative paths do not render on
  the Marketplace.
- **Root `README.md`** — only if the release changes how the product is described
  at a high level (a new shell, a new headline capability). Most releases leave it
  alone.

Match the existing wording style in each file (prose, `- **Name**: …`). No other
shell keeps such a document: the CLI README's command reference is updated with
the CLI change itself, and Electron's README is architecture-only.

## The commit

- First confirm `git status` shows only release-related changes — the version
  bump (`package.json` + `packages/*/package.json`), the notes file, the docs you
  edited, and the closed release under `.boardown/`. If anything unrelated is in
  the tree, stop and ask.
- The board changes ride along in this same commit rather than a separate
  `chore(board):` one — the release closing and the version bump are one event.
- Stage exactly those paths and commit as **`chore(release): v<version>`**. This
  scope is excluded from generated notes, so it never pollutes the next release.
- **Do not push, do not tag.** Report the prepared commit and let the human push
  when ready — the push is what triggers the release, and it is theirs to make.

## Definition of done

- The version came from the board's current release, and that release is now
  `finished`.
- The version is bumped across all packages and mirrored from the root.
- `docs/release-notes/v<version>.md` is curated: every user-facing change
  since the previous tag under exactly the surface(s) it reaches, one tight
  sentence each; no maintainer-only plumbing, no commit-subject copy-paste; title
  and footer intact.
- `packages/vscode/CHANGELOG.md` has a section for this version, and the extension
  README's Features list covers any new headline capability.
- `pnpm lint && pnpm typecheck && pnpm build && pnpm test` pass.
- Everything is in a single `chore(release): v<version>` commit, unpushed and
  untagged.
