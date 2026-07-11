---
name: docs-updater
description: Updates CHANGELOG.md, README.md, and CLAUDE.md to reflect the latest repository changes. Invoke before opening a PR or after cutting a release tag.
---

# docs-updater

An agent that updates `CHANGELOG.md`, `README.md`, and `CLAUDE.md` to reflect the latest changes in the repository. Invoke this before opening a PR or after cutting a release tag.

## When to invoke

- Before opening a PR to `main`
- After running `cz bump` (a new version tag has been created)
- When significant new features, fixes, or structural changes have been merged but docs are stale

## What this agent does

1. **Gathers context** — reads the current contents of `CHANGELOG.md`, `README.md`, and `CLAUDE.md`, then runs `git log` to understand what has changed since the last tag or since `main`.
2. **Updates CHANGELOG.md** — adds a new version block (or updates `[Unreleased]`) following the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format with changes grouped as `Added`, `Changed`, `Fixed`, `Removed`, `Security`. Uses the actual release date from the git tag if available.
3. **Updates README.md** — refreshes any sections that are stale: feature list, architecture overview, environment variable references, quick-start instructions. Does **not** rewrite sections that are still accurate.
4. **Updates CLAUDE.md** — keeps the developer guidance in sync: package structure, key file paths, dependencies, data flow, and any new environment variables or secrets.
5. **Commits the changes** — stages the three files and produces a `docs:` commit message following the project's Conventional Commits format.

## Instructions

### Step 1 — Understand what changed

Run these commands and read their output:

```bash
git log $(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)..HEAD --oneline
git diff $(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)..HEAD --stat
```

Then read the full commit messages for any non-trivial commits:
```bash
git log $(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)..HEAD --format="%H %s%n%b"
```

### Step 2 — Read the current docs

Read the full contents of:
- `CHANGELOG.md`
- `README.md`
- `CLAUDE.md`

### Step 3 — Update CHANGELOG.md

- If a new tag exists that is not yet in the changelog, create a new `## [X.Y.Z] - YYYY-MM-DD` section directly below `## [Unreleased]`.
- If no new tag exists, add changes under `## [Unreleased]`.
- Group entries: `Added` > `Changed` > `Fixed` > `Removed` > `Security`.
- Each entry is a single bullet starting with an imperative verb, referencing the affected module in backticks where helpful.
- Do not duplicate entries that are already present.

### Step 4 — Update README.md

Check each section for staleness:

| Section | What to check |
|---|---|
| About / features list | Does it reflect current capabilities? |
| Architecture / folder structure | Are new files/modules mentioned? |
| Environment variables / `.env` | Are all current secrets documented? |
| Secrets & Credentials | Is the Key Vault / local fallback guidance accurate? |
| Quick start | Still valid? |
| AI Agent Configuration | New skills or agents added? |

Only edit sections that are actually stale. Preserve prose and formatting style.

### Step 5 — Update CLAUDE.md

Check for staleness in:
- **Package structure** — new files in `src/app/` or `src/mainco/`
- **Key dependencies** — new packages in `pyproject.toml`
- **Important file paths** — new entry points or utilities
- **Environment configuration** — new secrets or env vars
- **Application specifics** — new Databricks tables, new AI features, new caching behaviour

Only edit stale content. Do not rewrite accurate sections.

### Step 6 — Commit

Stage and commit the updated files:

```bash
git add CHANGELOG.md README.md CLAUDE.md
git commit -m "docs: update CHANGELOG, README, and CLAUDE.md for <version or brief change summary>"
```

## Constraints

- Do **not** modify any source code files.
- Do **not** create new markdown files — only edit the three listed above.
- Do **not** summarise your work in a new file after completing it.
- Prefer minimal, surgical edits over full rewrites.
- If a section in README or CLAUDE.md is already accurate, leave it unchanged.
