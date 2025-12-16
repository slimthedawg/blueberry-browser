import React, { forwardRef } from 'react'
import { createPortal } from 'react-dom'
import { Download, File, X } from 'lucide-react'
import { cn } from '@common/lib/utils'

export interface DownloadItem {
    id: string
    filename: string
    url: string
    date: Date
    size?: number
    path?: string
}

interface DownloadHistoryPopupProps {
    downloads: DownloadItem[]
    onClose: () => void
    onDownloadClick?: (download: DownloadItem) => void
    position: { top: number; right: number }
}

const DownloadHistoryPopupComponent = forwardRef<HTMLDivElement, DownloadHistoryPopupProps>(({
    downloads,
    onClose,
    onDownloadClick,
    position
}, ref) => {
    const formatDate = (date: Date) => {
        const now = new Date()
        const diff = now.getTime() - date.getTime()
        const minutes = Math.floor(diff / 60000)
        const hours = Math.floor(diff / 3600000)
        const days = Math.floor(diff / 86400000)

        if (minutes < 1) return 'Just now'
        if (minutes < 60) return `${minutes}m ago`
        if (hours < 24) return `${hours}h ago`
        if (days < 7) return `${days}d ago`
        return date.toLocaleDateString()
    }

    const formatSize = (bytes?: number) => {
        if (!bytes) return ''
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    return createPortal(
        <>
            {/* Backdrop - transparent but clickable, only closes on click not hover */}
            <div
                className="fixed inset-0 bg-transparent pointer-events-auto"
                onClick={onClose}
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 99998,
                }}
            />

            {/* Popup */}
            <div
                ref={ref}
                className={cn(
                    "fixed w-80 bg-background border border-border rounded-lg shadow-lg pointer-events-auto",
                    "dark:bg-secondary dark:border-border/50"
                )}
                style={{
                    position: 'fixed',
                    top: `${position.top}px`,
                    right: `${position.right}px`,
                    zIndex: 99999,
                }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <div className="flex items-center gap-2">
                        <Download className="size-4 text-muted-foreground" />
                        <h3 className="text-sm font-semibold text-foreground">Downloads</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="size-6 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                {/* Downloads List */}
                <div className="max-h-96 overflow-y-auto">
                    {downloads.length === 0 ? (
                        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                            No downloads yet
                        </div>
                    ) : (
                        <div className="py-1">
                            {downloads.map((download) => (
                                <button
                                    key={download.id}
                                    onClick={async () => {
                                        await onDownloadClick?.(download)
                                        onClose()
                                    }}
                                    className={cn(
                                        "w-full px-4 py-2.5 flex items-start gap-3",
                                        "hover:bg-muted/50 transition-colors",
                                        "text-left group"
                                    )}
                                >
                                    <div className="mt-0.5 flex-shrink-0">
                                        <File className="size-4 text-muted-foreground group-hover:text-foreground" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-foreground truncate">
                                            {download.filename}
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-xs text-muted-foreground">
                                                {formatDate(download.date)}
                                            </span>
                                            {download.size && (
                                                <>
                                                    <span className="text-xs text-muted-foreground">•</span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {formatSize(download.size)}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </>,
        document.body
    )
})

DownloadHistoryPopupComponent.displayName = 'DownloadHistoryPopup'

export const DownloadHistoryPopup = DownloadHistoryPopupComponent

