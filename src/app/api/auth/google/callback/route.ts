import { getOAuthClient } from '@/lib/server-services'
import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')

    if (!code) {
        return NextResponse.json({ error: 'No code provided' }, { status: 400 })
    }

    try {
        const settingsList = await prisma.setting.findMany()
        const settings = settingsList.reduce((acc: Record<string, string>, curr: { key: string, value: string }) => ({ ...acc, [curr.key]: curr.value }), {} as Record<string, string>)

        const credentials = {
            clientId: settings.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
            clientSecret: settings.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
            baseUrl: settings.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL
        }

        const oauth2Client = getOAuthClient(credentials)

        const { tokens } = await oauth2Client.getToken(code)

        // Return a script that sends the tokens to the opener window and closes
        const html = `
            <html>
                <body>
                    <script>
                        window.opener.postMessage({
                            type: 'GOOGLE_AUTH_TOKENS',
                            tokens: ${JSON.stringify(tokens)}
                        }, window.location.origin);
                        window.close();
                    </script>
                    <p>Authentication successful! This window should close automatically.</p>
                </body>
            </html>
        `

        return new NextResponse(html, {
            headers: { 'Content-Type': 'text/html' }
        })
    } catch (e) {
        console.error('OAuth token exchange failed', e)
        return NextResponse.json({ error: 'Token exchange failed' }, { status: 500 })
    }
}
