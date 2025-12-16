import React, { useState, forwardRef } from 'react'
import { createPortal } from 'react-dom'
import { Star, Folder, FolderPlus, X, Check } from 'lucide-react'
import { cn } from '@common/lib/utils'

export interface BookmarkFolder {
    id: string
    name: string
    parentId?: string
}

interface BookmarkFolderPopupProps {
    folders: BookmarkFolder[]
    currentUrl: string
    currentTitle: string
    onClose: () => void
    onSave: (folderId: string | null) => void
    position: { top: number; right: number }
}

const BookmarkFolderPopupComponent = forwardRef<HTMLDivElement, BookmarkFolderPopupProps>(({
    folders,
    currentUrl,
    currentTitle,
    onClose,
    onSave,
    position
}, ref) => {
    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
    const [showNewFolder, setShowNewFolder] = useState(false)
    const [newFolderName, setNewFolderName] = useState('')

    const handleSave = () => {
        onSave(selectedFolderId)
        onClose()
    }

    const handleCreateFolder = () => {
        if (newFolderName.trim()) {
            // Placeholder - create folder logic
            console.log('Create folder:', newFolderName, 'in parent:', selectedFolderId)
            setShowNewFolder(false)
            setNewFolderName('')
        }
    }

    const rootFolders = folders.filter(f => !f.parentId)
    const getChildFolders = (parentId: string) => {
        return folders.filter(f => f.parentId === parentId)
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
                        <Star className="size-4 text-yellow-500 fill-yellow-500" />
                        <h3 className="text-sm font-semibold text-foreground">Bookmark</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="size-6 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                {/* Bookmark Info */}
                <div className="px-4 py-3 border-b border-border">
                    <div className="text-sm font-medium text-foreground truncate" title={currentTitle}>
                        {currentTitle || 'Untitled'}
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5" title={currentUrl}>
                        {currentUrl}
                    </div>
                </div>

                {/* Folder Selection */}
                <div className="max-h-64 overflow-y-auto py-2">
                    {/* Bookmarks Bar (default) */}
                    <button
                        onClick={() => setSelectedFolderId(null)}
                        className={cn(
                            "w-full px-4 py-2 flex items-center gap-3",
                            "hover:bg-muted/50 transition-colors",
                            "text-left group",
                            selectedFolderId === null && "bg-muted/30"
                        )}
                    >
                        <Star className={cn(
                            "size-4 flex-shrink-0",
                            selectedFolderId === null ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground group-hover:text-foreground"
                        )} />
                        <span className="text-sm text-foreground flex-1">Bookmarks Bar</span>
                        {selectedFolderId === null && (
                            <Check className="size-4 text-primary" />
                        )}
                    </button>

                    {/* Folders */}
                    {rootFolders.map((folder) => (
                        <FolderItem
                            key={folder.id}
                            folder={folder}
                            folders={folders}
                            selectedFolderId={selectedFolderId}
                            onSelect={setSelectedFolderId}
                            level={0}
                        />
                    ))}

                    {/* New Folder Input */}
                    {showNewFolder && (
                        <div className="px-4 py-2 border-t border-border">
                            <input
                                type="text"
                                value={newFolderName}
                                onChange={(e) => setNewFolderName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        handleCreateFolder()
                                    } else if (e.key === 'Escape') {
                                        setShowNewFolder(false)
                                        setNewFolderName('')
                                    }
                                }}
                                placeholder="Folder name"
                                className="w-full px-3 py-1.5 text-sm bg-background border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                autoFocus
                            />
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                    <button
                        onClick={() => setShowNewFolder(!showNewFolder)}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors"
                    >
                        <FolderPlus className="size-4" />
                        <span>New folder</span>
                    </button>
                    <div className="flex gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-4 py-1.5 text-sm font-medium text-foreground bg-secondary hover:bg-muted/70 border border-border rounded-md transition-colors"
                        >
                            Save
                        </button>
                    </div>
                </div>
            </div>
        </>,
        document.body
    )
})

BookmarkFolderPopupComponent.displayName = 'BookmarkFolderPopup'

export const BookmarkFolderPopup = BookmarkFolderPopupComponent

interface FolderItemProps {
    folder: BookmarkFolder
    folders: BookmarkFolder[]
    selectedFolderId: string | null
    onSelect: (id: string) => void
    level: number
}

const FolderItem: React.FC<FolderItemProps> = ({
    folder,
    folders,
    selectedFolderId,
    onSelect,
    level
}) => {
    const childFolders = folders.filter(f => f.parentId === folder.id)
    const [isExpanded, setIsExpanded] = useState(false)

    return (
        <>
            <button
                onClick={() => {
                    onSelect(folder.id)
                    if (childFolders.length > 0) {
                        setIsExpanded(!isExpanded)
                    }
                }}
                className={cn(
                    "w-full px-4 py-2 flex items-center gap-3",
                    "hover:bg-muted/50 transition-colors",
                    "text-left group",
                    selectedFolderId === folder.id && "bg-muted/30"
                )}
                style={{ paddingLeft: `${16 + level * 16}px` }}
            >
                <Folder className={cn(
                    "size-4 flex-shrink-0",
                    selectedFolderId === folder.id ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                )} />
                <span className="text-sm text-foreground flex-1 truncate">{folder.name}</span>
                {selectedFolderId === folder.id && (
                    <Check className="size-4 text-primary" />
                )}
            </button>
            {isExpanded && childFolders.map((child) => (
                <FolderItem
                    key={child.id}
                    folder={child}
                    folders={folders}
                    selectedFolderId={selectedFolderId}
                    onSelect={onSelect}
                    level={level + 1}
                />
            ))}
        </>
    )
}

