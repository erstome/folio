import { auth, signIn, isCloudMode } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Briefcase } from 'lucide-react'

// The cloud/local decision must happen per request, never at build time
// (a local build would otherwise bake in a permanent redirect to /).
export const dynamic = 'force-dynamic'

export default async function LoginPage() {
    if (!isCloudMode()) redirect('/')

    const session = await auth()
    if (session?.user) redirect('/')

    return (
        <div className="flex min-h-screen items-center justify-center px-6">
            <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-6">
                <h1 className="text-2xl font-bold text-white flex items-center justify-center gap-2">
                    <Briefcase className="w-7 h-7 text-indigo-500" />
                    Folio
                </h1>
                <p className="text-sm text-zinc-400">
                    Sign in with Google to continue. Your data is stored in a{' '}
                    <span className="text-zinc-200 font-medium">Folio</span> folder in your own
                    Google Drive — nothing is kept on the server.
                </p>
                <form
                    action={async () => {
                        'use server'
                        await signIn('google', { redirectTo: '/' })
                    }}
                >
                    <button
                        type="submit"
                        className="w-full px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
                    >
                        Sign in with Google
                    </button>
                </form>
            </div>
        </div>
    )
}
