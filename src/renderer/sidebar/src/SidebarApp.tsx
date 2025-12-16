import React, { useEffect, useState } from 'react'
import { ChatProvider } from './contexts/ChatContext'
import { RecordingProvider } from './contexts/RecordingContext'
import { Chat } from './components/Chat'
import { Recording } from './components/Recording'
import { SidebarResizeHandle } from './components/SidebarResizeHandle'
import { useDarkMode } from '@common/hooks/useDarkMode'
import { MessageSquare, Circle } from 'lucide-react'
import { cn } from '@common/lib/utils'

type TabType = 'chat' | 'recording'

const SidebarContent: React.FC = () => {
    const { isDarkMode } = useDarkMode()
    const [activeTab, setActiveTab] = useState<TabType>('chat')

    // Apply dark mode class to the document
    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add('dark')
        } else {
            document.documentElement.classList.remove('dark')
        }
    }, [isDarkMode])

    return (
        <div className="h-screen flex flex-col bg-background border-l border-border relative">
            {/* Resize Handle */}
            <SidebarResizeHandle />
            
            {/* Tab Navigation */}
            <div className="flex border-b border-border">
                <button
                    onClick={() => setActiveTab('chat')}
                    className={cn(
                        "flex-1 px-4 py-3 text-sm font-medium transition-colors",
                        "flex items-center justify-center gap-2",
                        activeTab === 'chat'
                            ? "text-primary border-b-2 border-primary bg-muted/50"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                    )}
                >
                    <MessageSquare className="h-4 w-4" />
                    Chat
                </button>
                <button
                    onClick={() => setActiveTab('recording')}
                    className={cn(
                        "flex-1 px-4 py-3 text-sm font-medium transition-colors",
                        "flex items-center justify-center gap-2",
                        activeTab === 'recording'
                            ? "text-primary border-b-2 border-primary bg-muted/50"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                    )}
                >
                    <Circle className="h-4 w-4" />
                    Recording
                </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-hidden min-h-0">
                {activeTab === 'chat' && <Chat />}
                {activeTab === 'recording' && <Recording />}
            </div>
        </div>
    )
}

export const SidebarApp: React.FC = () => {
    return (
        <ChatProvider>
            <RecordingProvider>
                <SidebarContent />
            </RecordingProvider>
        </ChatProvider>
    )
}

