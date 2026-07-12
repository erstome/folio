// Cloud mode = deployed with Google login + Drive-hosted DB (AUTH_SECRET
// set). Local mode = classic behavior: no login, SQLite at prisma/dev.db.
//
// Lives in its own module (not lib/auth.ts) so code that only needs the
// mode check doesn't pull next-auth into its import graph (vitest can't
// resolve next-auth's `next/server` import, and local mode shouldn't need
// the library at all).
export function isCloudMode() {
    return !!process.env.AUTH_SECRET
}
