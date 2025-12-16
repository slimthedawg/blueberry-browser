import React, { useState, useEffect, useRef } from 'react'
import { GripVertical } from 'lucide-react'
import { cn } from '@common/lib/utils'

export const SidebarResizeHandle: React.FC = () => {
    const [isDragging, setIsDragging] = useState(false)
    const [isHovering, setIsHovering] = useState(false)
    const handleRef = useRef<HTMLDivElement>(null)
    const startXRef = useRef<number>(0)
    const startWidthRef = useRef<number>(400)
    const lastRequestedWidthRef = useRef<number>(400)

    useEffect(() => {
        // Get initial sidebar width
        const getInitialWidth = async () => {
            if (window.sidebarAPI?.getSidebarWidth) {
                try {
                    const width = await window.sidebarAPI.getSidebarWidth()
                    startWidthRef.current = width
                    lastRequestedWidthRef.current = width
                } catch (error) {
                    console.error('Failed to get sidebar width:', error)
                }
            }
        }
        getInitialWidth()
    }, [])

    const handleMouseDown = async (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        
        // Get current width at the start of drag - this stays fixed during the entire drag
        if (window.sidebarAPI?.getSidebarWidth) {
            try {
                const currentWidth = await window.sidebarAPI.getSidebarWidth()
                startWidthRef.current = currentWidth
                lastRequestedWidthRef.current = currentWidth
            } catch (error) {
                console.error('Failed to get sidebar width:', error)
            }
        }
        
        setIsDragging(true)
        startXRef.current = e.clientX
    }

    useEffect(() => {
        if (!isDragging) return

        const performResize = (targetWidth: number) => {
            // Skip if this exact width was already requested
            if (targetWidth === lastRequestedWidthRef.current) {
                return
            }

            lastRequestedWidthRef.current = targetWidth

            // Fire resize request without blocking - let it complete in background
            if (window.sidebarAPI?.resizeSidebar) {
                window.sidebarAPI.resizeSidebar(targetWidth).catch((error) => {
                    console.error('Failed to resize sidebar:', error)
                })
            }
        }

        const handleMouseMove = (e: MouseEvent) => {
            // Calculate delta directly for immediate response
            // When dragging left (mouse moves left, clientX decreases), 
            // deltaX is positive, so width increases (correct)
            // When dragging right (mouse moves right, clientX increases),
            // deltaX is negative, so width decreases (correct)
            const deltaX = startXRef.current - e.clientX
            const newWidth = startWidthRef.current + deltaX

            // Constrain width between 300px and 800px
            const constrainedWidth = Math.max(300, Math.min(800, newWidth))

            // Fire resize immediately - 1:1 with mouse movement
            performResize(constrainedWidth)
        }

        const handleMouseUp = async () => {
            // Small delay to ensure final resize completes
            await new Promise(resolve => setTimeout(resolve, 50))
            
            // Update startWidthRef to match final width for next drag
            if (window.sidebarAPI?.getSidebarWidth) {
                try {
                    const finalWidth = await window.sidebarAPI.getSidebarWidth()
                    startWidthRef.current = finalWidth
                    lastRequestedWidthRef.current = finalWidth
                } catch (error) {
                    console.error('Failed to get final sidebar width:', error)
                }
            }
            
            setIsDragging(false)
        }

        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)

        return () => {
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
        }
    }, [isDragging])

    return (
        <div
            ref={handleRef}
            className={cn(
                "absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-20",
                "flex items-center justify-center",
                "cursor-col-resize select-none",
                "transition-all duration-150",
                "z-50 group",
                isDragging || isHovering
                    ? "bg-primary/30"
                    : "bg-border/20 hover:bg-border/40"
            )}
            onMouseDown={handleMouseDown}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => !isDragging && setIsHovering(false)}
            style={{
                userSelect: 'none',
                WebkitUserSelect: 'none',
            }}
        >
            {/* Visual grip indicator - always visible, more prominent on hover/drag */}
            <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center pointer-events-none">
                <GripVertical 
                    className={cn(
                        "w-3.5 h-3.5 transition-all duration-150",
                        isDragging 
                            ? "text-primary opacity-100" 
                            : isHovering
                            ? "text-muted-foreground opacity-80"
                            : "text-muted-foreground opacity-40"
                    )}
                />
            </div>
        </div>
    )
}

