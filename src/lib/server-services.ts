import YahooFinance from 'yahoo-finance2'
import { google } from 'googleapis'
import fs from 'fs'
import path from 'path'

export const yahooFinance = new YahooFinance({
    suppressNotices: ['yahooSurvey']
})

export const DB_PATH = path.join(process.cwd(), 'prisma', 'dev.db')

export function getOAuthClient(credentials?: { clientId?: string, clientSecret?: string, baseUrl?: string }) {
    return new google.auth.OAuth2(
        credentials?.clientId || process.env.GOOGLE_CLIENT_ID,
        credentials?.clientSecret || process.env.GOOGLE_CLIENT_SECRET,
        (credentials?.baseUrl || process.env.NEXT_PUBLIC_BASE_URL) + '/api/auth/google/callback'
    )
}

export { google, fs }
