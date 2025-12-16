import React, { useState } from 'react'
import { BrowserProvider } from './contexts/BrowserContext'
import { TabBar } from './components/TabBar'
import { AddressBar } from './components/AddressBar'
import { MainPopup } from './components/MainPopup'
import { WorkspacePanel } from './components/WorkspacePanel'
import { Menu } from 'lucide-react'
import { cn } from '@common/lib/utils'
import { useDarkMode } from '@common/hooks/useDarkMode'

export const TopBarApp: React.FC = () => {
    const [showMainPopup, setShowMainPopup] = useState(false)
    const mainPopupRef = React.useRef<HTMLDivElement>(null)
    const { isDarkMode } = useDarkMode()

    // Apply dark mode class to the document (same pattern as sidebar)
    React.useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add('dark')
        } else {
            document.documentElement.classList.remove('dark')
        }
    }, [isDarkMode])

    // Bring topbar to front when popup is shown, restore when closed
    React.useEffect(() => {
        if (showMainPopup) {
            // Expand immediately to avoid flash
            if (window.topBarAPI?.bringToFront) {
                // Use requestAnimationFrame to ensure smooth transition
                requestAnimationFrame(() => {
                    window.topBarAPI.bringToFront()
                })
            }
        } else {
            if (window.topBarAPI?.restoreBounds) {
                window.topBarAPI.restoreBounds()
            }
        }
    }, [showMainPopup])

    const handleOpenPopup = () => {
        setShowMainPopup(true)
    }

    const handleClosePopup = () => {
        setShowMainPopup(false)
    }

    return (
        <BrowserProvider>
            <div className="select-none relative" style={{ width: '100%', height: '100vh', overflow: 'hidden', background: 'transparent' }}>
                {/* Topbar Content - Only the top 88px has background */}
                <div className="flex flex-col bg-background relative z-10" style={{ height: '88px', flexShrink: 0 }}>
                    {/* Tab Bar */}
                    <div className="w-full h-10 pr-2 flex items-center app-region-drag bg-muted dark:bg-muted">
                        {/* Top-left menu button */}
                        <button
                            onClick={handleOpenPopup}
                            className={cn(
                                "size-8 flex items-center justify-center rounded-md",
                                "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                                "transition-colors app-region-no-drag ml-2"
                            )}
                        >
                            <Menu className="size-4" />
                        </button>
                        <TabBar />
                    </div>

                    {/* Toolbar - Chrome-style */}
                    <div className="flex items-center px-2 py-1.5 gap-2 app-region-drag bg-background border-b border-border/30" style={{ width: '100%', minWidth: 0 }}>
                        <AddressBar />
                    </div>
                </div>

                {/* Completely transparent area below - allows browser/sidebar to show through */}
                <div 
                    className="absolute inset-0 pointer-events-none"
                    style={{ 
                        top: '88px',
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'transparent',
                        zIndex: 0
                    }}
                >
                    {/* This area is completely transparent - browser and sidebar show through */}
                </div>

                {/* Main Popup */}
                {showMainPopup && (
                    <MainPopup
                        ref={mainPopupRef}
                        onClose={handleClosePopup}
                    >
                        <WorkspacePanel />
                    </MainPopup>
                )}
            </div>
        </BrowserProvider>
    )
}

