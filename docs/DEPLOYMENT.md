# Deploying Folio (cloud mode)

This guide deploys Folio to Vercel with Google sign-in, storing your database
as `Folio/folio.db` **in your own Google Drive**. The server keeps nothing:
your OAuth tokens live in an encrypted browser cookie, and every request
downloads/uploads your database file directly from/to your Drive.

Everything below works with a **standard personal Google account** and free
tiers only — no Google Workspace, no billing account, no paid Vercel plan.

**What you need**

- A Google account (a normal `@gmail.com` account is fine)
- A GitHub account (Vercel deploys from your repo)
- A Vercel account (free Hobby plan) — [vercel.com](https://vercel.com)

---

## Part 1 — Google Cloud setup (~10 minutes)

You need an OAuth client so the app can offer "Sign in with Google" and
access its own folder in your Drive.

### 1.1 Create a project

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and sign in.
2. Top bar → project selector → **New Project**. Name it e.g. `folio`. No
   billing setup is required.

### 1.2 Enable the Google Drive API

1. **APIs & Services → Library**.
2. Search for **Google Drive API** → **Enable**.

### 1.3 Configure the OAuth consent screen

1. **APIs & Services → OAuth consent screen**.
2. User type: **External** (the only option without Workspace) → **Create**.
3. Fill the minimum: app name (`Folio`), your email as user support email and
   developer contact. Leave the rest empty → save through the steps.
4. Under **Test users**, add your own Google email.

### 1.4 Publish the app (important — avoids weekly re-login)

While the consent screen status is **Testing**, Google expires refresh tokens
after **7 days**, so you would be forced to sign in again every week.

1. **OAuth consent screen → Publishing status → Publish app**.
2. Folio only requests the `drive.file` scope (access to files the app itself
   created — it cannot see the rest of your Drive). Google classifies this
   scope as **non-sensitive**, so publishing does **not** require the app
   verification process. If the console shows a "needs verification" notice,
   you can ignore it for a non-sensitive-scopes app; sign-in keeps working.

### 1.5 Create the OAuth client

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Web application**, name e.g. `folio-web`.
3. **Authorized redirect URIs** — add both:
   - `https://YOUR-APP.vercel.app/api/auth/callback/google` (fix the domain
     after Part 2 if you don't know it yet)
   - `http://localhost:3000/api/auth/callback/google` (for local testing)
4. **Create** → copy the **Client ID** and **Client Secret**.

---

## Part 2 — Deploy to Vercel (~10 minutes)

### 2.1 Import the repository

1. Push the repo to GitHub if it isn't there yet.
2. [vercel.com/new](https://vercel.com/new) → import the repo. Framework
   preset **Next.js**, no build settings to change (`postinstall` runs
   `prisma generate` automatically).

### 2.2 Set the environment variables

In the project's **Settings → Environment Variables** add:

| Variable | Value |
|---|---|
| `AUTH_SECRET` | Output of `npx auth secret` (or `openssl rand -base64 32`). **Setting this is what enables cloud mode.** |
| `ALLOWED_EMAILS` | Your Google email. Comma-separated list for several users. |
| `GOOGLE_CLIENT_ID` | From step 1.5 |
| `GOOGLE_CLIENT_SECRET` | From step 1.5 |

`DATABASE_URL` is **not** needed in cloud mode — there is no server database.

### 2.3 Deploy and fix the redirect URI

1. **Deploy**. Note the production domain (`https://your-app.vercel.app`).
2. Back in Google Cloud → Credentials → your OAuth client: make sure the
   redirect URI matches that domain exactly
   (`https://your-app.vercel.app/api/auth/callback/google`).

---

## Part 3 — First login and data migration

1. Open the deployed app → you land on the login page → **Sign in with
   Google** → consent to the Drive permission.
2. On first login the app creates a `Folio` folder with an empty `folio.db`
   in your Drive. You can see the file at
   [drive.google.com](https://drive.google.com) — it's your data, download it
   whenever you like.
3. Migrate your existing local data:
   - Locally: run the app (`npm run dev`) → **Data Management → Export DB**
     (downloads `folio_backup.db`).
   - Deployed app: **Data Management → Import DB** → pick that file. The
     import is written straight to your Drive.
4. Quote API keys (Twelvedata/FMP) are stored inside the database, so they
   come along with the import — no extra setup.

---

## Testing cloud mode locally (optional)

Create `.env.local` (never commit it) with the same four variables from
step 2.2 and run `npm run dev`. Sign-in uses the
`http://localhost:3000/api/auth/callback/google` redirect URI from step 1.5.
Without `AUTH_SECRET` the app runs in classic local mode (no login,
`prisma/dev.db`).

---

## Adding more users later

1. Add their Google email to `ALLOWED_EMAILS` in Vercel and redeploy.
2. Each user gets their **own** `Folio/folio.db` in their **own** Drive —
   users never share a database.

---

## Costs and limits

- **Vercel Hobby**: free; a personal finance app stays far below its limits.
- **Google Drive API**: free; the per-user quota is far beyond what page
  loads generate. The DB file itself is well under 1 MB against your 15 GB
  Drive quota.
- Expect pages to load slightly slower than locally (~0.3–1 s): each request
  checks your Drive file's version and re-downloads it when it changed.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Sign-in ends in "Access Denied" | Your email isn't in `ALLOWED_EMAILS` (exact match, case-insensitive). |
| "Google session expired. Please sign out and sign in again." | Refresh token expired or was revoked. If it happens weekly, the consent screen is still in **Testing** — see step 1.4. |
| "Your data changed in Google Drive (another device or tab?)" | Two sessions wrote at the same time; the app refuses to overwrite. Reload the page and redo the change. |
| First page after a while is slow | Serverless cold start + fresh Drive download. Subsequent loads are faster. |
| Want to start over | Delete `Folio/folio.db` in your Drive; the next login creates a fresh empty database. |

## Caveat: schema changes

New app versions that change `prisma/schema.prisma` do **not** automatically
migrate the `folio.db` files already living in users' Drives (there is no
server that could run migrations). For a schema change: export the DB,
migrate it locally (`npx prisma db push` against the exported file), import
it back — and regenerate the seed template with `npm run db:template` before
deploying.
