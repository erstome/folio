import { isCloudMode } from './app-mode'
import { dbContext, DbContext } from './db'
import { ensureLocalDb, persistDb } from './drive-db'

// Wraps a server action so that, in cloud mode, it runs against the
// signed-in user's Drive-hosted database: hydrate from Drive, execute inside
// an AsyncLocalStorage context (which the `prisma` proxy resolves), and
// upload back only if something was written. Local mode and nested calls
// (wrapped actions invoking each other) pass straight through.
export function withDb<A extends unknown[], R>(
    fn: (...args: A) => Promise<R>
): (...args: A) => Promise<R> {
    return async (...args: A): Promise<R> => {
        if (!isCloudMode()) return fn(...args)
        if (dbContext.getStore()) return fn(...args)

        // Lazy so next-auth is only loaded in cloud mode (it breaks module
        // resolution under vitest and is dead weight for local mode).
        const { auth } = await import('./auth')
        const session = await auth()
        const email = session?.user?.email
        const accessToken = session?.accessToken
        if (session?.error === 'RefreshTokenError') {
            throw new Error('Google session expired. Please sign out and sign in again.')
        }
        if (!email || !accessToken) {
            throw new Error('Not authenticated')
        }

        const { client, dbPath } = await ensureLocalDb(email, accessToken)
        const ctx: DbContext = { client, dbPath, dirty: false }

        let result: R
        try {
            result = await dbContext.run(ctx, () => fn(...args))
        } catch (err) {
            // Best-effort save of writes that happened before the failure;
            // the original error stays the one surfaced.
            if (ctx.dirty) await persistDb(email, accessToken).catch(() => { })
            throw err
        }
        if (ctx.dirty) await persistDb(email, accessToken)
        return result
    }
}
