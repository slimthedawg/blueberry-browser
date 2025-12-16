import React, { forwardRef } from 'react'
import { createPortal } from 'react-dom'
import { User, LogIn, X } from 'lucide-react'
import { cn } from '@common/lib/utils'

interface UserPopupProps {
    onClose: () => void
    position: { top: number; right: number }
}

const UserPopupComponent = forwardRef<HTMLDivElement, UserPopupProps>(({
    onClose,
    position
}, ref) => {
    return createPortal(
        <>
            {/* Backdrop */}
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
                        <User className="size-4 text-muted-foreground" />
                        <h3 className="text-sm font-semibold text-foreground">Account</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="size-6 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4">
                    <div className="flex flex-col items-center gap-4 py-6">
                        <div className="size-16 rounded-full bg-muted flex items-center justify-center">
                            <User className="size-8 text-muted-foreground" />
                        </div>
                        <div className="text-center">
                            <p className="text-sm text-muted-foreground mb-1">Not signed in</p>
                            <p className="text-xs text-muted-foreground/70">Sign in to sync your data</p>
                        </div>
                        <button
                            className={cn(
                                "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-md",
                                "hover:bg-[#051f4a] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#07285D]",
                                "transition-colors"
                            )}
                            style={{ backgroundColor: '#07285D' }}
                        >
                            <LogIn className="size-4" />
                            Sign in
                        </button>
                    </div>
                </div>
            </div>
        </>,
        document.body
    )
})

UserPopupComponent.displayName = 'UserPopup'

export const UserPopup = UserPopupComponent



















