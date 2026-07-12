import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { auth, isCloudMode } from '@/lib/auth'

// Running through auth() also persists refreshed Google tokens into the
// session cookie on navigation, so server actions rarely see expired tokens.
const protect = auth((req) => {
    if (req.auth?.user) return NextResponse.next()
    if (req.nextUrl.pathname.startsWith('/login')) return NextResponse.next()
    return NextResponse.redirect(new URL('/login', req.nextUrl.origin))
})

export default function middleware(req: NextRequest, ctx: unknown) {
    if (!isCloudMode()) return NextResponse.next()
    return (protect as unknown as (req: NextRequest, ctx: unknown) => Response)(req, ctx)
}

export const config = {
    // Everything except auth endpoints and static assets
    matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
}
