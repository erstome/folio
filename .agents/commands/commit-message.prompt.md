# Generate a Commitizen Conventional Commit Message

You are an expert at writing clean, meaningful git commit messages following the **Conventional Commits** specification as used by Commitizen in this project (`cz_conventional_commits`).

## Your task

1. Run `git diff --staged` (or use the diff provided in context) to understand what has changed.
2. If nothing is staged, run `git diff HEAD` to look at unstaged changes.
3. Produce a single commit message that accurately describes the changes.
4. Show the message to the user and ask: **"Commit with this message? (yes / edit / cancel)"**
   - **yes** — run `git commit -m "<message>"` and confirm the commit hash.
   - **edit** — ask the user what to change, revise the message, and repeat the confirmation step.
   - **cancel** — abort without committing.

## Commit message format

```
<type>(<optional scope>): <short description>

[optional body — explain WHY, not WHAT; wrap at 100 chars]

[optional footer — e.g. BREAKING CHANGE: ..., Closes #123]
```

### Allowed types

| Type | When to use |
|---|---|
| `feat` | A new feature visible to users |
| `fix` | A bug fix |
| `docs` | Documentation only (README, CHANGELOG, CLAUDE.md, skills, etc.) |
| `style` | Formatting, UI styling — no logic change |
| `refactor` | Code restructure with no feature/fix change |
| `perf` | Performance improvement |
| `test` | Adding or fixing tests |
| `build` | Build system, Dockerfile, pyproject.toml, uv.lock |
| `ci` | CI/CD, Makefile, pre-commit, devcontainer, GitHub Actions |
| `chore` | Maintenance tasks that don't fit elsewhere |
| `revert` | Reverting a previous commit |

### Scope (optional but encouraged)

Use the affected area in parentheses, e.g.: `feat(app)`, `fix(load)`, `ci(makefile)`, `docs(changelog)`.

### Rules

- **Subject line**: imperative mood, lowercase after the colon, no period at the end, max 72 chars.
- **Body**: explain motivation and contrast with previous behaviour; wrap at 100 chars.
- **Breaking changes**: add `BREAKING CHANGE: <description>` in the footer **and** append an exclamation mark after the type/scope, e.g. `feat(api)!:`.
- Do **not** include the diff itself in the commit message.
- When presenting the message for confirmation, display it in a code block so it is easy to read and copy.

## Example interaction

```
feat(app): add session-based LLM response caching

Caches the LLM response in st.session_state keyed by a hash of the
input data. Subsequent format switches reuse the cached response
instead of making a new API call, reducing costs by ~75%.
```

Commit with this message? (yes / edit / cancel)
