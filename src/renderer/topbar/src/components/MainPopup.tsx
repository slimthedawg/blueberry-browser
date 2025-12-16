import React, { forwardRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@common/lib/utils'

interface MainPopupProps {
    onClose: () => void
    children?: React.ReactNode
}

const MainPopupComponent = forwardRef<HTMLDivElement, MainPopupProps>(({
    onClose,
    children
}, ref) => {
    return createPortal(
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 pointer-events-auto backdrop-blur-sm"
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

            {/* Popup - 80% width and height */}
            <div
                ref={ref}
                className={cn(
                    "fixed bg-background border border-border rounded-lg shadow-2xl pointer-events-auto app-region-no-drag",
                    "dark:bg-secondary dark:border-border/50",
                    "flex flex-col"
                )}
                style={{
                    position: 'fixed',
                    top: '10%',
                    left: '10%',
                    width: '80%',
                    height: '80%',
                    zIndex: 99999,
                }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
                    <h2 className="text-lg font-semibold text-foreground">Workspaces</h2>
                    <button
                        onClick={onClose}
                        className="size-8 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <X className="size-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-6" style={{ pointerEvents: "auto" }}>
                    {children || (
                        <div className="text-center text-muted-foreground">
                         
                        </div>
                    )}
                </div>
            </div>
        </>,
        document.body
    )
})

MainPopupComponent.displayName = 'MainPopup'

export const MainPopup = MainPopupComponent








