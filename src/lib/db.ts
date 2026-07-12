import { PrismaClient } from '@prisma/client'
import { AsyncLocalStorage } from 'async_hooks'

// In cloud mode each request runs against the signed-in user's own SQLite
// file (downloaded from their Google Drive to /tmp). The active client is
// carried through the request via AsyncLocalStorage so the ~1900 lines of
// existing `prisma.*` call sites need no changes. Outside any context (local
// mode, tests) the proxy falls back to the classic local singleton.
export type DbContext = {
    client: PrismaClient
    dbPath: string
    // Set when any mutating Prisma method runs; the action wrapper uploads
    // the DB file back to Drive only when this is true.
    dirty: boolean
}

export const dbContext = new AsyncLocalStorage<DbContext>()

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined
}

let localClient: PrismaClient | undefined

function getLocalClient(): PrismaClient {
    if (globalForPrisma.prisma) return globalForPrisma.prisma
    if (!localClient) {
        localClient = new PrismaClient()
        if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = localClient
    }
    return localClient
}

const WRITE_METHODS = new Set([
    'create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany',
    '$executeRaw', '$executeRawUnsafe', '$transaction',
])

export const prisma = new Proxy({} as PrismaClient, {
    get(_target, prop) {
        const ctx = dbContext.getStore()
        const client = ctx?.client ?? getLocalClient()
        const value = (client as Record<PropertyKey, unknown> & PrismaClient)[prop as keyof PrismaClient]

        if (typeof value === 'function') {
            const fn = value as (...args: unknown[]) => unknown
            if (ctx && typeof prop === 'string' && WRITE_METHODS.has(prop)) {
                return (...args: unknown[]) => {
                    ctx.dirty = true
                    return fn.apply(client, args)
                }
            }
            return fn.bind(client)
        }

        // Model delegates (prisma.asset, prisma.transaction, …): in cloud mode,
        // wrap them so mutating methods flag the context dirty.
        if (ctx && value && typeof value === 'object' && typeof prop === 'string' && !prop.startsWith('$')) {
            return new Proxy(value as Record<PropertyKey, unknown>, {
                get(delegate, method) {
                    const dValue = delegate[method as string]
                    if (typeof dValue !== 'function') return dValue
                    const dFn = dValue as (...args: unknown[]) => unknown
                    if (typeof method === 'string' && WRITE_METHODS.has(method)) {
                        return (...args: unknown[]) => {
                            ctx.dirty = true
                            return dFn.apply(delegate, args)
                        }
                    }
                    return dFn.bind(delegate)
                },
            })
        }

        return value
    },
})

// For code that mutates the SQLite file without going through Prisma
// (e.g. importDatabase overwriting the file directly).
export function markDbDirty() {
    const ctx = dbContext.getStore()
    if (ctx) ctx.dirty = true
}

// Path of the DB file backing the current request; null in local mode.
export function currentDbPath(): string | null {
    return dbContext.getStore()?.dbPath ?? null
}
