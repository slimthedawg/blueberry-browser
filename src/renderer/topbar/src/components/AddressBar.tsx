import React, { useState, useEffect, useRef } from 'react'
import { ArrowLeft, ArrowRight, RefreshCw, Loader2, PanelLeftClose, PanelLeft, Lock, Unlock, AlertTriangle, Star, Download, Puzzle, User, MoreVertical, Search } from 'lucide-react'
import { useBrowser } from '../contexts/BrowserContext'
import { ToolBarButton } from '../components/ToolBarButton'
import { Favicon } from '../components/Favicon'
import { DarkModeToggle } from '../components/DarkModeToggle'
import { DownloadHistoryPopup, DownloadItem } from '../components/DownloadHistoryPopup'
import { BookmarkFolderPopup, BookmarkFolder } from '../components/BookmarkFolderPopup'
import { UserPopup } from '../components/UserPopup'
import { cn } from '@common/lib/utils'

export const AddressBar: React.FC = () => {
    const { activeTab, navigateToUrl, goBack, goForward, reload, isLoading } = useBrowser()
    const [url, setUrl] = useState('')
    const [isEditing, setIsEditing] = useState(false)
    const [isFocused, setIsFocused] = useState(false)
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)
    const [isBookmarked, setIsBookmarked] = useState(false)
    const [showDownloadPopup, setShowDownloadPopup] = useState(false)
    const [showBookmarkPopup, setShowBookmarkPopup] = useState(false)
    const [showUserPopup, setShowUserPopup] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)
    const downloadButtonRef = useRef<HTMLDivElement>(null)
    const bookmarkButtonRef = useRef<HTMLDivElement>(null)
    const userButtonRef = useRef<HTMLDivElement>(null)
    const downloadPopupRef = useRef<HTMLDivElement>(null)
    const bookmarkPopupRef = useRef<HTMLDivElement>(null)
    const userPopupRef = useRef<HTMLDivElement>(null)

    // Bring topbar to front when popups are shown, restore when closed
    useEffect(() => {
        if (showDownloadPopup || showBookmarkPopup || showUserPopup) {
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
    }, [showDownloadPopup, showBookmarkPopup, showUserPopup])

    // Close popups when mouse moves far away from both button and popup
    useEffect(() => {
        const SAFE_DISTANCE = 50 // pixels - safe space around button and popup
        
        const getDistanceToElement = (x: number, y: number, rect: DOMRect): number => {
            // If point is inside the rectangle, distance is 0 (negative means inside)
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                return 0
            }
            // Calculate distance from point to nearest edge of rectangle
            const dx = Math.max(rect.left - x, 0, x - rect.right)
            const dy = Math.max(rect.top - y, 0, y - rect.bottom)
            return Math.sqrt(dx * dx + dy * dy)
        }

        const handleMouseMove = (e: MouseEvent) => {
            // Check download popup
            if (showDownloadPopup) {
                const button = downloadButtonRef.current
                const popup = downloadPopupRef.current
                
                let minDistance = Infinity
                
                if (button) {
                    const buttonRect = button.getBoundingClientRect()
                    const distance = getDistanceToElement(e.clientX, e.clientY, buttonRect)
                    minDistance = Math.min(minDistance, distance)
                }
                
                if (popup) {
                    const popupRect = popup.getBoundingClientRect()
                    const distance = getDistanceToElement(e.clientX, e.clientY, popupRect)
                    minDistance = Math.min(minDistance, distance)
                }
                
                // Only close if mouse is far away from both
                if (minDistance > SAFE_DISTANCE) {
                    setShowDownloadPopup(false)
                }
            }

            // Check bookmark popup
            if (showBookmarkPopup) {
                const button = bookmarkButtonRef.current
                const popup = bookmarkPopupRef.current
                
                let minDistance = Infinity
                
                if (button) {
                    const buttonRect = button.getBoundingClientRect()
                    const distance = getDistanceToElement(e.clientX, e.clientY, buttonRect)
                    minDistance = Math.min(minDistance, distance)
                }
                
                if (popup) {
                    const popupRect = popup.getBoundingClientRect()
                    const distance = getDistanceToElement(e.clientX, e.clientY, popupRect)
                    minDistance = Math.min(minDistance, distance)
                }
                
                // Only close if mouse is far away from both
                if (minDistance > SAFE_DISTANCE) {
                    setShowBookmarkPopup(false)
                }
            }

            // Check user popup
            if (showUserPopup) {
                const button = userButtonRef.current
                const popup = userPopupRef.current
                
                let minDistance = Infinity
                
                if (button) {
                    const buttonRect = button.getBoundingClientRect()
                    const distance = getDistanceToElement(e.clientX, e.clientY, buttonRect)
                    minDistance = Math.min(minDistance, distance)
                }
                
                if (popup) {
                    const popupRect = popup.getBoundingClientRect()
                    const distance = getDistanceToElement(e.clientX, e.clientY, popupRect)
                    minDistance = Math.min(minDistance, distance)
                }
                
                // Only close if mouse is far away from both
                if (minDistance > SAFE_DISTANCE) {
                    setShowUserPopup(false)
                }
            }
        }

        if (showDownloadPopup || showBookmarkPopup || showUserPopup) {
            // Small delay to allow smooth movement between button and popup
            const timeoutId = setTimeout(() => {
                document.addEventListener('mousemove', handleMouseMove)
            }, 150)
            
            return () => {
                clearTimeout(timeoutId)
                document.removeEventListener('mousemove', handleMouseMove)
            }
        }
    }, [showDownloadPopup, showBookmarkPopup, showUserPopup])

    // Mock download history (in real app, this would come from storage/API)
    const [downloads] = useState<DownloadItem[]>([
        {
            id: '1',
            filename: 'document.pdf',
            url: 'https://example.com/document.pdf',
            date: new Date(Date.now() - 5 * 60000), // 5 minutes ago
            size: 1024 * 512, // 512 KB
            path: 'C:\\Users\\Slim\\Downloads\\document.pdf', // Mock path
        },
        {
            id: '2',
            filename: 'image.jpg',
            url: 'https://example.com/image.jpg',
            date: new Date(Date.now() - 2 * 3600000), // 2 hours ago
            size: 1024 * 1024 * 2, // 2 MB
            path: 'C:\\Users\\Slim\\Downloads\\image.jpg',
        },
        {
            id: '3',
            filename: 'video.mp4',
            url: 'https://example.com/video.mp4',
            date: new Date(Date.now() - 24 * 3600000), // 1 day ago
            size: 1024 * 1024 * 50, // 50 MB
            path: 'C:\\Users\\Slim\\Downloads\\video.mp4',
        },
        {
            id: '4',
            filename: 'archive.zip',
            url: 'https://example.com/archive.zip',
            date: new Date(Date.now() - 3 * 24 * 3600000), // 3 days ago
            size: 1024 * 1024 * 10, // 10 MB
            path: 'C:\\Users\\Slim\\Downloads\\archive.zip',
        },
        {
            id: '5',
            filename: 'presentation.pptx',
            url: 'https://example.com/presentation.pptx',
            date: new Date(Date.now() - 7 * 24 * 3600000), // 7 days ago
            size: 1024 * 1024 * 5, // 5 MB
            path: 'C:\\Users\\Slim\\Downloads\\presentation.pptx',
        },
    ])

    // Mock bookmark folders (in real app, this would come from storage/API)
    const [bookmarkFolders] = useState<BookmarkFolder[]>([
        { id: '1', name: 'Work' },
        { id: '2', name: 'Personal' },
        { id: '3', name: 'Research', parentId: '1' },
        { id: '4', name: 'Projects', parentId: '1' },
        { id: '5', name: 'Shopping' },
    ])

    // Update URL when active tab changes
    useEffect(() => {
        if (activeTab && !isEditing) {
            setUrl(activeTab.url || '')
        }
    }, [activeTab, isEditing])

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!url.trim()) return

        let finalUrl = url.trim()

        // Add protocol if missing
        if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
            // Check if it looks like a domain
            if (finalUrl.includes('.') && !finalUrl.includes(' ')) {
                finalUrl = `https://${finalUrl}`
            } else {
                // Treat as search query
                finalUrl = `https://www.google.com/search?q=${encodeURIComponent(finalUrl)}`
            }
        }

        navigateToUrl(finalUrl)
        setIsEditing(false)
        setIsFocused(false)
            ; (document.activeElement as HTMLElement)?.blur()
    }

    const handleFocus = () => {
        setIsEditing(true)
        setIsFocused(true)
        // Select all text when focused
        setTimeout(() => {
            if (inputRef.current) {
                inputRef.current.select()
            }
        }, 0)
    }
    
    const handleClick = () => {
        // Select all text when clicking on the input
        if (inputRef.current) {
            inputRef.current.select()
        }
    }

    const handleBlur = () => {
        setIsEditing(false)
        setIsFocused(false)
        // Reset to current tab URL if editing was cancelled
        if (activeTab) {
            setUrl(activeTab.url || '')
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            setIsEditing(false)
            setIsFocused(false)
            if (activeTab) {
                setUrl(activeTab.url || '')
            }
            ; (e.target as HTMLInputElement).blur()
        }
    }

    const canGoBack = activeTab !== null
    const canGoForward = activeTab !== null

    // Extract domain and title for display
    const getDomain = () => {
        if (!activeTab?.url) return ''
        try {
            const urlObj = new URL(activeTab.url)
            return urlObj.hostname.replace('www.', '')
        } catch {
            return activeTab.url
        }
    }

    const getPath = () => {
        if (!activeTab?.url) return ''
        try {
            const urlObj = new URL(activeTab.url)
            return urlObj.pathname + urlObj.search + urlObj.hash
        } catch {
            return ''
        }
    }

    const getFavicon = () => {
        if (!activeTab?.url) return null
        try {
            const domain = new URL(activeTab.url).hostname
            return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
        } catch {
            return null
        }
    }

    // Get site security information
    const getSiteSecurity = () => {
        if (!activeTab?.url) return { protocol: null, isSecure: false, icon: null }
        try {
            const urlObj = new URL(activeTab.url)
            const isSecure = urlObj.protocol === 'https:'
            const isHttp = urlObj.protocol === 'http:'
            
            if (isSecure) {
                return { protocol: 'https', isSecure: true, icon: Lock }
            } else if (isHttp) {
                return { protocol: 'http', isSecure: false, icon: Unlock }
            } else {
                return { protocol: urlObj.protocol, isSecure: false, icon: AlertTriangle }
            }
        } catch {
            return { protocol: null, isSecure: false, icon: null }
        }
    }

    // Get full URL for display
    const getFullUrl = () => {
        if (!activeTab?.url) return ''
        return activeTab.url
    }

    const toggleSidebar = () => {
        setIsSidebarOpen(!isSidebarOpen)
        // Send IPC event to toggle sidebar
        if (window.topBarAPI) {
            window.topBarAPI.toggleSidebar()
        }
    }

    const siteSecurity = getSiteSecurity()
    const SecurityIcon = siteSecurity.icon

    // Calculate popup positions
    const getDownloadPopupPosition = () => {
        if (!downloadButtonRef.current) return { top: 48, right: 16 }
        const rect = downloadButtonRef.current.getBoundingClientRect()
        return {
            top: rect.bottom + 4,
            right: window.innerWidth - rect.right,
        }
    }

    const getBookmarkPopupPosition = () => {
        if (!bookmarkButtonRef.current) return { top: 48, right: 16 }
        const rect = bookmarkButtonRef.current.getBoundingClientRect()
        return {
            top: rect.bottom + 4,
            right: window.innerWidth - rect.right,
        }
    }

    const getUserPopupPosition = () => {
        if (!userButtonRef.current) return { top: 48, right: 16 }
        const rect = userButtonRef.current.getBoundingClientRect()
        return {
            top: rect.bottom + 4,
            right: window.innerWidth - rect.right,
        }
    }

    const handleDownloadClick = async (download: DownloadItem) => {
        if (download.path && window.topBarAPI?.showItemInFolder) {
            try {
                await window.topBarAPI.showItemInFolder(download.path)
            } catch (error) {
                console.error('Failed to open file:', error)
            }
        } else {
            console.log('Open download:', download)
        }
    }

    const handleBookmarkSave = (folderId: string | null) => {
        setIsBookmarked(true)
        console.log('Save bookmark to folder:', folderId || 'Bookmarks Bar', {
            url: activeTab?.url,
            title: activeTab?.title,
        })
    }

    return (
        <>
            {/* Navigation Controls - Chrome-style */}
            <div className="flex gap-0.5 app-region-no-drag">
                <ToolBarButton
                    Icon={ArrowLeft}
                    onClick={goBack}
                    active={canGoBack && !isLoading}
                    className="text-foreground/70 hover:text-foreground"
                />
                <ToolBarButton
                    Icon={ArrowRight}
                    onClick={goForward}
                    active={canGoForward && !isLoading}
                    className="text-foreground/70 hover:text-foreground"
                />
                <ToolBarButton
                    onClick={reload}
                    active={activeTab !== null && !isLoading}
                    className="text-foreground/70 hover:text-foreground"
                >
                    {isLoading ? (
                        <Loader2 className="size-4 animate-spin" />
                    ) : (
                        <RefreshCw className="size-4" />
                    )}
                </ToolBarButton>
            </div>

            {/* Address Bar */}
            {isFocused ? (
                // Expanded State - Chrome-style input
                <form onSubmit={handleSubmit} className="flex-1 min-w-0 max-w-full">
                    <div className="bg-muted/30 rounded-full shadow-sm border border-border/50 dark:border-border/30 px-4 h-9 flex items-center gap-2 dark:bg-secondary/30">
                        {/* Site Security Icon */}
                        {SecurityIcon && (
                            <SecurityIcon 
                                className={cn(
                                    "size-4 flex-shrink-0",
                                    siteSecurity.isSecure ? "text-green-600 dark:text-green-500" : "text-muted-foreground"
                                )} 
                            />
                        )}
                        <input
                            ref={inputRef}
                            type="text"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            onFocus={handleFocus}
                            onClick={handleClick}
                            onBlur={handleBlur}
                            onKeyDown={handleKeyDown}
                            className="flex-1 min-w-0 text-sm outline-none bg-transparent text-foreground"
                            placeholder={activeTab ? "Enter URL or search term" : "No active tab"}
                            disabled={!activeTab}
                            spellCheck={false}
                            autoFocus
                        />
                    </div>
                </form>
            ) : (
                // Collapsed State - Chrome-style display
                <div
                    onClick={handleFocus}
                    className={cn(
                        "flex-1 min-w-0 px-4 h-9 rounded-full cursor-text group/address-bar",
                        "bg-muted/30 hover:bg-muted/50 text-muted-foreground app-region-no-drag",
                        "transition-all duration-200 border border-transparent",
                        "hover:border-border/30 dark:hover:bg-muted/40",
                        "flex items-center gap-2"
                    )}
                >
                    {/* Favicon */}
                    <div className="size-4 flex-shrink-0">
                        <Favicon src={getFavicon()} />
                    </div>

                    {/* Site Security Icon */}
                    {SecurityIcon && (
                        <SecurityIcon 
                            className={cn(
                                "size-3.5 flex-shrink-0",
                                siteSecurity.isSecure ? "text-green-600 dark:text-green-500" : "text-muted-foreground/60"
                            )} 
                        />
                    )}

                    {/* Full URL Display */}
                    <div className="text-sm leading-normal flex-1 min-w-0 overflow-hidden">
                        {activeTab ? (
                            <span className="text-foreground block truncate">{getFullUrl()}</span>
                        ) : (
                            <span className="text-muted-foreground block truncate">No active tab</span>
                        )}
                    </div>
                </div>
            )}

            {/* Chrome-style Action Buttons */}
            <div className="flex items-center gap-0.5 app-region-no-drag" style={{ flexShrink: 0 }}>
                {/* Bookmark Button */}
                <div ref={bookmarkButtonRef} className="relative">
                    <ToolBarButton
                        onClick={() => {
                            if (isBookmarked) {
                                setIsBookmarked(false)
                                setShowBookmarkPopup(false)
                            } else {
                                setShowDownloadPopup(false)
                                setShowBookmarkPopup(!showBookmarkPopup)
                            }
                        }}
                        className={cn(
                            "transition-colors",
                            isBookmarked 
                                ? "text-yellow-500 hover:text-yellow-600" 
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <Star className={cn(
                            "size-4",
                            isBookmarked && "fill-current"
                        )} />
                    </ToolBarButton>
                </div>
                
                {/* Download Button */}
                <div ref={downloadButtonRef} className="relative">
                    <ToolBarButton
                        Icon={Download}
                        onClick={() => {
                            setShowBookmarkPopup(false)
                            setShowDownloadPopup(!showDownloadPopup)
                        }}
                        className="text-muted-foreground hover:text-foreground"
                    />
                </div>
                
                {/* Extensions Button */}
                <ToolBarButton
                    Icon={Puzzle}
                    onClick={() => {
                        // Placeholder - extensions menu
                        console.log('Extensions clicked')
                    }}
                    className="text-muted-foreground hover:text-foreground"
                />
                
                {/* Dark Mode Toggle */}
                <DarkModeToggle />
                
                {/* Sidebar Toggle */}
                <ToolBarButton
                    Icon={isSidebarOpen ? PanelLeftClose : PanelLeft}
                    onClick={toggleSidebar}
                    toggled={isSidebarOpen}
                    className="text-muted-foreground hover:text-foreground"
                />
                
                {/* Profile/Account Button */}
                <div ref={userButtonRef} className="relative">
                    <ToolBarButton
                        Icon={User}
                        onClick={() => {
                            setShowDownloadPopup(false)
                            setShowBookmarkPopup(false)
                            setShowUserPopup(!showUserPopup)
                        }}
                        className="text-muted-foreground hover:text-foreground"
                    />
                </div>
                
                {/* Menu Button (Three Dots) */}
                <ToolBarButton
                    Icon={MoreVertical}
                    onClick={() => {
                        // Placeholder - menu
                        console.log('Menu clicked')
                    }}
                    className="text-muted-foreground hover:text-foreground"
                />
            </div>

            {/* Download History Popup */}
            {showDownloadPopup && (
                <DownloadHistoryPopup
                    ref={downloadPopupRef}
                    downloads={downloads.slice(0, 5)}
                    onClose={() => setShowDownloadPopup(false)}
                    onDownloadClick={handleDownloadClick}
                    position={getDownloadPopupPosition()}
                />
            )}

            {/* Bookmark Folder Popup */}
            {showBookmarkPopup && (
                <BookmarkFolderPopup
                    ref={bookmarkPopupRef}
                    folders={bookmarkFolders}
                    currentUrl={activeTab?.url || ''}
                    currentTitle={activeTab?.title || ''}
                    onClose={() => setShowBookmarkPopup(false)}
                    onSave={handleBookmarkSave}
                    position={getBookmarkPopupPosition()}
                />
            )}

            {/* User Popup */}
            {showUserPopup && (
                <UserPopup
                    ref={userPopupRef}
                    onClose={() => setShowUserPopup(false)}
                    position={getUserPopupPosition()}
                />
            )}
        </>
    )
}