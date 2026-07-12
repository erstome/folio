// Google sign-in for cloud deployments (Auth.js v5).
//
// Cloud mode is enabled by setting AUTH_SECRET. Without it the app runs in
// local mode: no login, data in the local SQLite file — exactly the
// pre-deployment behavior.
//
// The Google login also grants the drive.file scope, so the same session
// tokens give access to the user's Folio database file in their Drive.
// Sessions use the JWT strategy: tokens live only in the encrypted session
// cookie — the server persists nothing.
//
// IMPORTANT: keep this module edge-safe (it is imported by middleware.ts).
// No googleapis / fs / prisma imports here.

import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import type { JWT } from 'next-auth/jwt'

export { isCloudMode } from './app-mode'

declare module 'next-auth' {
    interface Session {
        // The user's own Google access token (drive.file scope). Same trust
        // level as the pre-existing backup flow, which handed tokens to the
        // browser via the OAuth popup.
        accessToken?: string
        error?: 'RefreshTokenError'
    }
}

function allowedEmails(): string[] {
    return (process.env.ALLOWED_EMAILS || '')
        .split(',')
        .map(e => e.trim().toLowerCase())
        .filter(Boolean)
}

// Google access tokens expire after ~1h; refresh with the long-lived
// refresh token, keeping the previous refresh token if Google omits it.
async function refreshGoogleToken(token: JWT): Promise<JWT> {
    try {
        if (!token.refreshToken) throw new Error('No refresh token in session')

        const res = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: process.env.GOOGLE_CLIENT_ID!,
                client_secret: process.env.GOOGLE_CLIENT_SECRET!,
                grant_type: 'refresh_token',
                refresh_token: token.refreshToken as string,
            }),
        })

        const data = await res.json()
        if (!res.ok) throw new Error(`Token refresh HTTP ${res.status}: ${data.error ?? ''}`)

        return {
            ...token,
            accessToken: data.access_token,
            expiresAt: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
            refreshToken: data.refresh_token ?? token.refreshToken,
            error: undefined,
        }
    } catch (e) {
        console.error('[auth] Google token refresh failed:', e)
        return { ...token, error: 'RefreshTokenError' }
    }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
    // Fallback keeps module init happy in local mode, where auth is never used.
    secret: process.env.AUTH_SECRET || 'folio-local-mode-unused',
    trustHost: true,
    session: { strategy: 'jwt' },
    pages: { signIn: '/login' },
    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            authorization: {
                params: {
                    scope: 'openid email profile https://www.googleapis.com/auth/drive.file',
                    // offline + consent so Google returns a refresh token
                    access_type: 'offline',
                    prompt: 'consent',
                },
            },
        }),
    ],
    callbacks: {
        signIn({ user }) {
            const email = user.email?.toLowerCase()
            return !!email && allowedEmails().includes(email)
        },
        async jwt({ token, account }) {
            if (account) {
                return {
                    ...token,
                    accessToken: account.access_token,
                    refreshToken: account.refresh_token,
                    expiresAt: account.expires_at,
                }
            }
            const expiresAt = (token.expiresAt as number | undefined) ?? 0
            // 60s safety margin so a token can't expire mid-request
            if (Date.now() < expiresAt * 1000 - 60_000) return token
            return refreshGoogleToken(token)
        },
        session({ session, token }) {
            session.accessToken = token.accessToken as string | undefined
            session.error = token.error as 'RefreshTokenError' | undefined
            return session
        },
    },
})
