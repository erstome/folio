'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Cloud, CloudUpload, CloudDownload, Link as LinkIcon, RefreshCcw, CheckCircle2, AlertCircle, Database } from 'lucide-react'
import { getGoogleAuthUrl, backupToGoogleDrive, restoreFromGoogleDrive, getSettings, updateSettings, exportDatabase, importDatabase, backupToLocalPath, getAppMode } from '@/app/actions'
import { Settings, Save, AlertTriangle, Download, Upload, FolderSync, Monitor, Globe } from 'lucide-react'

interface DataManagementDialogProps {
    isOpen: boolean
    onClose: () => void
}

export function DataManagementDialog({ isOpen, onClose }: DataManagementDialogProps) {
    const [mounted, setMounted] = useState(false)
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
    const [message, setMessage] = useState('')
    const [tokens, setTokens] = useState<any>(null)
    const [isSettingsOpen, setIsSettingsOpen] = useState(false)
    const [config, setConfig] = useState<Record<string, string>>({})
    const [activeTab, setActiveTab] = useState<'cloud' | 'local'>('local')
    const [localPath, setLocalPath] = useState('')
    // Cloud deployment: data already lives in the user's Google Drive, so the
    // manual Drive backup tab and local folder sync make no sense there.
    const [cloudMode, setCloudMode] = useState(false)

    useEffect(() => {
        setMounted(true)
        const savedTokens = localStorage.getItem('google_drive_tokens')
        if (savedTokens) {
            setTokens(JSON.parse(savedTokens))
        }
        getAppMode().then(m => setCloudMode(m.cloud)).catch(() => { })
        loadSettings()
    }, [])

    const loadSettings = async () => {
        const s = await getSettings()
        setConfig(s)
        if (s.LOCAL_BACKUP_PATH) setLocalPath(s.LOCAL_BACKUP_PATH)
    }

    // Listen for tokens from the callback window
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data?.type === 'GOOGLE_AUTH_TOKENS') {
                const newTokens = event.data.tokens
                setTokens(newTokens)
                localStorage.setItem('google_drive_tokens', JSON.stringify(newTokens))
                setStatus('success')
                setMessage('Connected to Google Drive successfully!')
            }
        }
        window.addEventListener('message', handleMessage)
        return () => window.removeEventListener('message', handleMessage)
    }, [])

    if (!isOpen || !mounted) return null

    const handleConnect = async () => {
        setStatus('loading')
        try {
            const url = await getGoogleAuthUrl()
            window.open(url, 'Google Auth', 'width=600,height=600')
        } catch (e: any) {
            setStatus('error')
            setMessage(e.message || 'Failed to get auth URL')
        }
    }

    const handleBackup = async () => {
        if (!tokens) return
        setStatus('loading')
        setMessage('Uploading database to Google Drive...')
        const result = await backupToGoogleDrive(tokens)
        if (result.success) {
            setStatus('success')
            setMessage(result.message || 'Backup completed!')
        } else {
            setStatus('error')
            setMessage(result.error || 'Backup failed')
        }
    }

    const handleRestore = async () => {
        if (!tokens) return
        if (!confirm('This will OVERWRITE your local data with the cloud backup. Are you sure?')) return

        setStatus('loading')
        setMessage('Downloading database from Google Drive...')
        const result = await restoreFromGoogleDrive(tokens)
        if (result.success) {
            setStatus('success')
            setMessage('Restore completed! Page will reload in 2 seconds...')
            setTimeout(() => {
                window.location.reload()
            }, 2000)
        } else {
            setStatus('error')
            setMessage(result.error || 'Restore failed')
        }
    }

    const handleSaveSettings = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setStatus('loading')
        const formData = new FormData(e.currentTarget)
        const data: Record<string, string> = {
            TWELVEDATA_API_KEY: formData.get('twelveDataApiKey') as string,
            FMP_API_KEY: formData.get('fmpApiKey') as string,
        }
        if (!cloudMode) {
            data.GOOGLE_CLIENT_ID = formData.get('clientId') as string
            data.GOOGLE_CLIENT_SECRET = formData.get('clientSecret') as string
            data.NEXT_PUBLIC_BASE_URL = formData.get('baseUrl') as string
        }
        await updateSettings(data)
        setConfig(prev => ({ ...prev, ...data }))
        setStatus('success')
        setMessage('Settings saved successfully!')
        setIsSettingsOpen(false)
    }

    const handleExport = async () => {
        setStatus('loading')
        const result = await exportDatabase()
        if (result.success && result.content) {
            const blob = new Blob([Buffer.from(result.content, 'base64')], { type: 'application/x-sqlite3' })
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = result.filename || 'folio_backup.db'
            a.click()
            setStatus('success')
            setMessage('Database exported successfully!')
        } else {
            setStatus('error')
            setMessage(result.error || 'Export failed')
        }
    }

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        if (!confirm('This will OVERWRITE your local data. Proceed?')) return

        setStatus('loading')
        const reader = new FileReader()
        reader.onload = async (event) => {
            const content = event.target?.result as string
            const base64Content = content.split(',')[1]
            const result = await importDatabase(base64Content)
            if (result.success) {
                setStatus('success')
                setMessage('Import successful! Reloading...')
                setTimeout(() => window.location.reload(), 2000)
            } else {
                setStatus('error')
                setMessage(result.error || 'Import failed')
            }
        }
        reader.readAsDataURL(file)
    }

    const handleLocalSync = async () => {
        if (!localPath) return
        setStatus('loading')
        const result = await backupToLocalPath(localPath)
        if (result.success) {
            await updateSettings({ LOCAL_BACKUP_PATH: localPath })
            setStatus('success')
            setMessage(`Backup saved to: ${result.path}`)
        } else {
            setStatus('error')
            setMessage(result.error || 'Local backup failed')
        }
    }

    const handleDisconnect = () => {
        localStorage.removeItem('google_drive_tokens')
        setTokens(null)
        setStatus('idle')
        setMessage('')
    }

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl p-6 space-y-6">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                        <Database className="w-5 h-5 text-indigo-500" />
                        Data Management
                    </h2>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                            className={`p-1.5 rounded-lg transition-colors ${isSettingsOpen ? 'bg-indigo-500/10 text-indigo-500' : 'text-muted-foreground hover:text-foreground'}`}
                            title="Cloud Settings"
                        >
                            <Settings className="w-5 h-5" />
                        </button>
                        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-border -mx-6 px-6">
                    <button
                        onClick={() => { setActiveTab('local'); setIsSettingsOpen(false); }}
                        className={`pb-3 text-sm font-medium transition-colors relative ${activeTab === 'local' ? 'text-indigo-500' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                        <div className="flex items-center gap-2">
                            <Monitor className="w-4 h-4" />
                            Local Data
                        </div>
                        {activeTab === 'local' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full" />}
                    </button>
                    {!cloudMode && (
                        <button
                            onClick={() => { setActiveTab('cloud'); setIsSettingsOpen(false); }}
                            className={`pb-3 text-sm font-medium transition-colors relative ml-6 ${activeTab === 'cloud' ? 'text-indigo-500' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            <div className="flex items-center gap-2">
                                <Globe className="w-4 h-4" />
                                Cloud Sync
                            </div>
                            {activeTab === 'cloud' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full" />}
                        </button>
                    )}
                </div>

                <div className="space-y-4">
                    {isSettingsOpen ? (
                        <form onSubmit={handleSaveSettings} className="space-y-4 animate-in slide-in-from-top-2 duration-200">
                            {!cloudMode && (
                                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex gap-2 text-xs text-amber-600 dark:text-amber-500 mb-2">
                                    <AlertTriangle className="w-4 h-4 shrink-0" />
                                    <p>These settings are required for the "final user" to connect their own Google Drive without using .env files.</p>
                                </div>
                            )}

                            <div className="space-y-3">
                                {!cloudMode && (<>
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">Google Client ID</label>
                                    <input
                                        name="clientId"
                                        defaultValue={config.GOOGLE_CLIENT_ID}
                                        placeholder="Enter Client ID"
                                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">Google Client Secret</label>
                                    <input
                                        name="clientSecret"
                                        type="password"
                                        defaultValue={config.GOOGLE_CLIENT_SECRET}
                                        placeholder="Enter Client Secret"
                                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">Base URL (App Domain)</label>
                                    <input
                                        name="baseUrl"
                                        defaultValue={config.NEXT_PUBLIC_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '')}
                                        placeholder="http://localhost:3000"
                                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                    />
                                </div>
                                </>)}
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">FMP API Key (Optional)</label>
                                    <input
                                        name="fmpApiKey"
                                        type="password"
                                        defaultValue={config.FMP_API_KEY}
                                        placeholder="Enter FMP API Key"
                                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                    />
                                    <p className="text-[10px] text-muted-foreground">
                                        Free tier: 250 req/day. Premium needed for some EU stocks.
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">Twelvedata API Key (Optional)</label>
                                    <input
                                        name="twelveDataApiKey"
                                        type="password"
                                        defaultValue={config.TWELVEDATA_API_KEY}
                                        placeholder="Enter Twelvedata API Key"
                                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                    />
                                    <p className="text-[10px] text-muted-foreground">
                                        Free tier: 800 credits/day. Good for EU stocks.
                                    </p>
                                </div>
                            </div>

                            <button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2">
                                <Save className="w-4 h-4" />
                                Save Configuration
                            </button>
                        </form>
                    ) : activeTab === 'local' ? (
                        <div className="space-y-6 py-2 animate-in fade-in duration-300">
                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={handleExport}
                                    className="flex flex-col items-center justify-center p-4 bg-background border border-border rounded-xl hover:bg-muted/50 transition-colors group"
                                >
                                    <Download className="w-8 h-8 text-indigo-500 mb-2 group-hover:scale-110 transition-transform" />
                                    <span className="text-sm font-medium text-foreground">Export DB</span>
                                    <span className="text-xs text-muted-foreground mt-1 text-center">Download to PC</span>
                                </button>
                                <label className="flex flex-col items-center justify-center p-4 bg-background border border-border rounded-xl hover:bg-muted/50 transition-colors group cursor-pointer text-center">
                                    <Upload className="w-8 h-8 text-emerald-500 mb-2 group-hover:scale-110 transition-transform" />
                                    <span className="text-sm font-medium text-foreground">Import DB</span>
                                    <span className="text-xs text-muted-foreground mt-1">Upload from PC</span>
                                    <input type="file" className="hidden" accept=".db" onChange={handleImport} />
                                </label>
                            </div>

                            {!cloudMode && (
                            <div className="space-y-3 pt-2">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                                        <FolderSync className="w-4 h-4 text-indigo-500" />
                                        Local Folder Sync
                                    </h3>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Sync your database to a specific folder on your computer (e.g., a Dropbox or iCloud folder).
                                </p>
                                <div className="flex gap-2">
                                    <input
                                        value={localPath}
                                        onChange={(e) => setLocalPath(e.target.value)}
                                        placeholder="/path/to/backup/folio_backup.db"
                                        className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                    />
                                    <button
                                        onClick={handleLocalSync}
                                        disabled={!localPath || status === 'loading'}
                                        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white p-2 rounded-lg transition-colors"
                                    >
                                        <Save className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            )}
                        </div>
                    ) : tokens ? (
                        <div className="space-y-4">
                            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-3">
                                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                <div className="text-sm">
                                    <p className="text-foreground font-medium">Connected to Google Drive</p>
                                    <button
                                        onClick={handleDisconnect}
                                        className="text-xs text-muted-foreground hover:text-rose-500 underline transition-colors"
                                    >
                                        Disconnect account
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={handleBackup}
                                    disabled={status === 'loading'}
                                    className="flex flex-col items-center justify-center p-4 bg-background border border-border rounded-xl hover:bg-muted/50 transition-colors group disabled:opacity-50"
                                >
                                    <CloudUpload className="w-8 h-8 text-indigo-500 mb-2 group-hover:scale-110 transition-transform" />
                                    <span className="text-sm font-medium text-foreground">Backup Now</span>
                                </button>
                                <button
                                    onClick={handleRestore}
                                    disabled={status === 'loading'}
                                    className="flex flex-col items-center justify-center p-4 bg-background border border-border rounded-xl hover:bg-muted/50 transition-colors group disabled:opacity-50"
                                >
                                    <CloudDownload className="w-8 h-8 text-emerald-500 mb-2 group-hover:scale-110 transition-transform" />
                                    <span className="text-sm font-medium text-foreground">Restore Cloud</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-6 space-y-4">
                            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
                                <Cloud className="w-8 h-8 text-muted-foreground" />
                            </div>
                            <div className="space-y-1">
                                <h3 className="text-foreground font-medium">No Cloud Account Connected</h3>
                                <p className="text-sm text-muted-foreground">Connect your Google Drive to sync your data across devices.</p>
                            </div>
                            <button
                                onClick={handleConnect}
                                disabled={status === 'loading'}
                                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                <LinkIcon className="w-4 h-4" />
                                Connect Google Drive
                            </button>
                        </div>
                    )}

                    {status === 'loading' && (
                        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground animate-pulse">
                            <RefreshCcw className="w-4 h-4 animate-spin" />
                            {message || 'Processing...'}
                        </div>
                    )}

                    {(status === 'success' || status === 'error') && message && (
                        <div className={`p-3 rounded-lg text-sm flex items-start gap-2 ${status === 'success' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                            {status === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                            {message}
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    )
}
