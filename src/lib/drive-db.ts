// Cloud-mode storage layer: the user's SQLite database lives as
// `Folio/folio.db` in their own Google Drive. Per request we download it to
// /tmp (only when its Drive version changed), run the existing Prisma code
// against it, and upload it back after writes. Nothing persists server-side;
// /tmp and the caches below are per-lambda-instance best-effort only.

import { PrismaClient } from '@prisma/client'
import { google } from 'googleapis'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { TEMPLATE_DB_BASE64 } from './template-db'

const FOLDER_NAME = 'Folio'
const DB_FILE_NAME = 'folio.db'
const DB_MIME = 'application/x-sqlite3'
// Within this window we trust the local copy without re-checking Drive, so a
// page render firing several actions does one metadata call, not five.
const FRESHNESS_WINDOW_MS = 10_000

type UserDbEntry = {
    dbPath: string
    fileId?: string
    // Drive `version` of the content our local copy corresponds to
    version?: string
    lastCheckedAt: number
    client?: PrismaClient
    hydrating?: Promise<void>
    persistQueue: Promise<unknown>
}

const entries = new Map<string, UserDbEntry>()

function entryFor(email: string): UserDbEntry {
    let entry = entries.get(email)
    if (!entry) {
        const hash = crypto.createHash('sha256').update(email).digest('hex').slice(0, 16)
        entry = {
            dbPath: path.join(os.tmpdir(), `folio-${hash}.db`),
            lastCheckedAt: 0,
            persistQueue: Promise.resolve(),
        }
        entries.set(email, entry)
    }
    return entry
}

function driveFor(accessToken: string) {
    const authClient = new google.auth.OAuth2()
    authClient.setCredentials({ access_token: accessToken })
    return google.drive({ version: 'v3', auth: authClient })
}

type Drive = ReturnType<typeof driveFor>

async function findOrCreateFolder(drive: Drive): Promise<string> {
    const res = await drive.files.list({
        q: `name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id)',
        spaces: 'drive',
    })
    const existing = res.data.files?.[0]
    if (existing?.id) return existing.id

    const created = await drive.files.create({
        requestBody: { name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
        fields: 'id',
    })
    return created.data.id!
}

async function locateOrCreateDbFile(drive: Drive, entry: UserDbEntry): Promise<void> {
    const folderId = await findOrCreateFolder(drive)

    const res = await drive.files.list({
        q: `name = '${DB_FILE_NAME}' and '${folderId}' in parents and trashed = false`,
        fields: 'files(id, version)',
        spaces: 'drive',
    })
    const existing = res.data.files?.[0]
    if (existing?.id) {
        entry.fileId = existing.id
        return
    }

    // First login: seed the user's Drive with an empty database.
    fs.writeFileSync(entry.dbPath, Buffer.from(TEMPLATE_DB_BASE64, 'base64'))
    const created = await drive.files.create({
        requestBody: { name: DB_FILE_NAME, mimeType: DB_MIME, parents: [folderId] },
        media: { mimeType: DB_MIME, body: fs.createReadStream(entry.dbPath) },
        fields: 'id, version',
    })
    entry.fileId = created.data.id!
    entry.version = created.data.version ?? undefined
    entry.lastCheckedAt = Date.now()
}

async function download(drive: Drive, entry: UserDbEntry, version: string): Promise<void> {
    const res = await drive.files.get(
        { fileId: entry.fileId!, alt: 'media' },
        { responseType: 'arraybuffer' }
    )
    // The old client (if any) holds handles on the previous file contents.
    if (entry.client) {
        await entry.client.$disconnect().catch(() => { })
        entry.client = undefined
    }
    fs.writeFileSync(entry.dbPath, Buffer.from(res.data as ArrayBuffer))
    entry.version = version
}

async function hydrate(entry: UserDbEntry, accessToken: string): Promise<void> {
    const hasLocalCopy = entry.version !== undefined && fs.existsSync(entry.dbPath)
    if (hasLocalCopy && Date.now() - entry.lastCheckedAt < FRESHNESS_WINDOW_MS) return

    const drive = driveFor(accessToken)

    if (!entry.fileId) {
        await locateOrCreateDbFile(drive, entry)
        // locateOrCreateDbFile fully initialises fresh files
        if (entry.version !== undefined && fs.existsSync(entry.dbPath)) return
    }

    const meta = await drive.files.get({ fileId: entry.fileId!, fields: 'version' })
    const remoteVersion = meta.data.version ?? undefined
    if (remoteVersion !== entry.version || !fs.existsSync(entry.dbPath)) {
        await download(drive, entry, remoteVersion!)
    }
    entry.lastCheckedAt = Date.now()
}

export async function ensureLocalDb(
    email: string,
    accessToken: string
): Promise<{ client: PrismaClient; dbPath: string }> {
    const entry = entryFor(email)

    // Coalesce concurrent hydrations (Promise.all of several actions per page)
    if (!entry.hydrating) {
        entry.hydrating = hydrate(entry, accessToken).finally(() => {
            entry.hydrating = undefined
        })
    }
    await entry.hydrating

    if (!entry.client) {
        entry.client = new PrismaClient({ datasourceUrl: `file:${entry.dbPath}` })
    }
    return { client: entry.client, dbPath: entry.dbPath }
}

async function doPersist(entry: UserDbEntry, accessToken: string): Promise<void> {
    const drive = driveFor(accessToken)

    // Flush any WAL pages into the main file before uploading (no-op when the
    // journal mode isn't WAL).
    if (entry.client) {
        await entry.client.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE);').catch(() => { })
    }

    // Optimistic lock: refuse to clobber a version we haven't seen.
    const meta = await drive.files.get({ fileId: entry.fileId!, fields: 'version' })
    if ((meta.data.version ?? undefined) !== entry.version) {
        entry.lastCheckedAt = 0
        entry.version = undefined // force re-download on next request
        throw new Error(
            'Your data changed in Google Drive (another device or tab?). Reload the page and try again.'
        )
    }

    const res = await drive.files.update({
        fileId: entry.fileId!,
        media: { mimeType: DB_MIME, body: fs.createReadStream(entry.dbPath) },
        fields: 'version',
    })
    entry.version = res.data.version ?? undefined
    entry.lastCheckedAt = Date.now()
}

// Uploads are serialised per user so overlapping actions in one instance
// can't race each other; they all upload the same /tmp file anyway.
export async function persistDb(email: string, accessToken: string): Promise<void> {
    const entry = entryFor(email)
    if (!entry.fileId) return
    const run = entry.persistQueue.then(() => doPersist(entry, accessToken))
    entry.persistQueue = run.catch(() => { })
    return run
}

// Call before overwriting the SQLite file bytes directly (DB import): the
// cached client must not keep handles on the replaced file.
export async function invalidateDbClient(dbPath: string): Promise<void> {
    for (const entry of Array.from(entries.values())) {
        if (entry.dbPath === dbPath && entry.client) {
            await entry.client.$disconnect().catch(() => { })
            entry.client = undefined
        }
    }
}
