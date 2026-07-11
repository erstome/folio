# Generate a Pull Request Description

You are an expert at writing clear, structured pull request descriptions that help reviewers quickly understand what changed, why, and how to verify it.

## Your task

1. Run `git fetch origin` to ensure local refs are up to date.
2. Determine the base branch (default: `main`). If the user specifies a different base, use that.
3. Run `git log origin/main..HEAD --oneline` to list the commits in this PR.
4. Run `git diff origin/main..HEAD --stat` to understand the scope of changes.
5. For any non-trivial commit, read its full message with `git log --format="%s%n%n%b" <sha>`.
6. Produce a PR description following the format below.
7. Show the description to the user and ask: **"Use this PR description? (yes / edit / cancel)"**
   - **yes** — output the final markdown in a single fenced code block, ready to paste into Azure DevOps / GitHub.
   - **edit** — ask what to change, revise, and repeat the confirmation step.
   - **cancel** — abort.

## PR description format

```markdown
## <Short title summarising the overall change>

### Summary

<2–4 sentences: what this PR does and why. Focus on user/developer impact, not implementation details.>

---

### Changes

#### `<type>` — <group label>
- **`<file or component>`** — <what changed and why>
- ...

#### `<type>` — <group label>
- ...

---

### Files changed

| File | Change |
|---|---|
| `path/to/file` | <one-line description> |
| ... | ... |

---

### Checklist
- [ ] `CHANGELOG.md` updated
- [ ] `README.md` / `CLAUDE.md` updated if behaviour changed
- [ ] Tests added or updated
- [ ] No secrets or credentials committed
```

## Grouping rules

- Group commits by their Conventional Commit **type** (`feat`, `fix`, `ci`, `docs`, etc.).
- Within each group, one bullet per logical change — do not repeat information already clear from the file list.
- If the PR contains only docs or CI changes, omit the checklist items that are not relevant.
- Keep the title ≤ 72 characters, imperative mood, no trailing period.

## Rules

- Write for a reviewer who is **not** the author — assume no prior context.
- Explain **why** changes were made, not just what files were touched.
- Do **not** paste diffs or raw git output into the description.
- Present the final description inside a fenced `markdown` code block so it is easy to copy.

## Example output

```markdown
## Add session-based LLM response caching and structured output validation

### Summary

Adds a smart caching layer that stores LLM responses in `st.session_state`,
keyed by a hash of the input data. Switching between output formats no longer
triggers a new API call, cutting costs by ~75%. Also introduces Pydantic schemas
for validated response parsing and multiple display-format renderers.

---

### Changes

#### `feat` — LLM response caching
- **`src/app/app.py`** — cache LLM response in session state; invalidate on data change
- **`src/app/utils/formatters.py`** — add markdown, table, and JSON renderers

#### `feat` — Structured output processing
- **`src/mainco/schemas.py`** — Pydantic models for work-order validation
- **`src/mainco/output_processor.py`** — parse and validate raw LLM responses

---

### Files changed

| File | Change |
|---|---|
| `src/app/app.py` | Add caching logic and format selector |
| `src/app/utils/formatters.py` | New — three output format renderers |
| `src/package/schemas.py` | New — Pydantic work-order schema |
| `src/package/output_processor.py` | New — LLM response parser |

---

### Checklist
- [x] `CHANGELOG.md` updated
- [x] `README.md` / `CLAUDE.md` updated if behaviour changed
- [ ] Tests added or updated
- [x] No secrets or credentials committed
```

Use this PR description? (yes / edit / cancel)
