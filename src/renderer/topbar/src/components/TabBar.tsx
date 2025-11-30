import React from 'react'
import { Plus, X } from 'lucide-react'
import { useBrowser } from '../contexts/BrowserContext'
import { Favicon } from '../components/Favicon'
import { TabBarButton } from '../components/TabBarButton'
import { cn } from '@common/lib/utils'

interface TabItemProps {
    id: string
    title: string
    favicon?: string | null
    isActive: boolean
    isPinned?: boolean
    onClose: () => void
    onActivate: () => void
}

const TabItem: React.FC<TabItemProps> = ({
    title,
    favicon,
    isActive,
    isPinned = false,
    onClose,
    onActivate
}) => {
    const baseClassName = cn(
        "relative flex items-center h-8 pl-2 pr-1.5 select-none rounded-md",
        "text-primary group/tab transition-all duration-200 cursor-pointer",
        "app-region-no-drag", // Make tabs clickable
        isActive
            ? "bg-background shadow-tab dark:bg-secondary dark:shadow-none"
            : "bg-transparent hover:bg-muted/50 dark:hover:bg-muted/30",
        isPinned ? "w-8 !px-0 justify-center" : ""
    )

    return (
        <div className="py-1 px-0.5">
            <div
                className={baseClassName}
                onClick={() => !isActive && onActivate()}
            >
                {/* Favicon */}
                <div className={cn(!isPinned && "mr-2")}>
                    <Favicon src={favicon} />
                </div>

                {/* Title (hide for pinned tabs) */}
                {!isPinned && (
                    <span className="text-xs truncate max-w-[200px] flex-1">
                        {title || 'New Tab'}
                    </span>
                )}

                {/* Close button (shows on hover) */}
                {!isPinned && (
                    <div
                        onClick={(e) => {
                            e.stopPropagation()
                            onClose()
                        }}
                        className={cn(
                            "flex-shrink-0 p-1 rounded-md transition-opacity",
                            "hover:bg-muted dark:hover:bg-muted/50",
                            "opacity-0 group-hover/tab:opacity-100",
                            isActive && "opacity-100"
                        )}
                    >
                        <X className="size-3 text-primary dark:text-primary" />
                    </div>
                )}
            </div>
        </div>
    )
}

export const TabBar: React.FC = () => {
    const { tabs, createTab, closeTab, switchTab } = useBrowser()

    const handleCreateTab = async () => {
        await createTab() // Create new tab with default URL
    }

    // Extract favicon from URL (simplified - you might want to improve this)
    const getFavicon = (url: string) => {
        try {
            const domain = new URL(url).hostname
            return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
        } catch {
            return null
        }
    }

    return (
        <div className="flex-1 overflow-x-hidden flex items-center h-full">
            {/* macOS traffic lights spacing */}
            <div className="pl-20" />

            {/* Tabs Container - Scrollable */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden flex items-center gap-0.5 min-w-0 scrollbar-hide">
                <div className="flex items-center gap-0.5 h-full">
                    {tabs.length === 0 ? (
                        <div className="text-xs text-muted-foreground px-3">
                            No tabs open
                        </div>
                    ) : (
                        tabs.map(tab => (
                            <TabItem
                                key={tab.id}
                                id={tab.id}
                                title={tab.title}
                                favicon={getFavicon(tab.url)}
                                isActive={tab.isActive}
                                onClose={() => closeTab(tab.id)}
                                onActivate={() => switchTab(tab.id)}
                            />
                        ))
                    )}
                </div>
            </div>

            {/* Add Tab Button - Always visible */}
            <div className="flex-shrink-0 pl-1 pr-2">
                <TabBarButton
                    Icon={Plus}
                    onClick={handleCreateTab}
                    className="h-8 w-8"
                />
            </div>
        </div>
    )
}

