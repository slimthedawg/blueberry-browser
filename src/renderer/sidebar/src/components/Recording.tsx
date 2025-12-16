import React, { useState, useEffect } from 'react'
import { useRecording } from '../contexts/RecordingContext'
import { Play, Square, Pause, Trash2, Clock, Circle, FolderOpen, Edit2, Check, X } from 'lucide-react'
import { Button } from '@common/components/Button'
import { cn } from '@common/lib/utils'

export const Recording: React.FC = () => {
  const {
    state,
    recordings,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    loadRecording,
    deleteRecording,
    renameRecording,
  } = useRecording()

  const [selectedRecording, setSelectedRecording] = useState<any>(null)
  const [recordingName, setRecordingName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [recordingsDir, setRecordingsDir] = useState<string | null>(null)
  const [editingRecordingId, setEditingRecordingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState<string>('')

  // Load recordings directory path
  useEffect(() => {
    const loadDir = async () => {
      try {
        const dir = await window.sidebarAPI.recordingGetDirectory()
        setRecordingsDir(dir)
      } catch (error) {
        console.error('Failed to load recordings directory:', error)
      }
    }
    loadDir()
  }, [])

  // Debug: Log when component renders
  useEffect(() => {
    console.log('Recording component rendered', { state, recordingsCount: recordings.length })
  }, [state, recordings])

  // Handle errors from context
  useEffect(() => {
    try {
      // Test if context is working
      if (!state) {
        setError('Recording context not initialized')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }, [state])

  const openRecordingsFolder = async () => {
    try {
      await window.sidebarAPI.recordingOpenDirectory()
    } catch (error) {
      console.error('Failed to open recordings folder:', error)
    }
  }

  const handleStart = async () => {
    await startRecording(recordingName || undefined)
    setRecordingName('')
  }

  const handleStop = async () => {
    await stopRecording()
    setSelectedRecording(null)
  }

  const handleLoad = async (id: string) => {
    const recording = await loadRecording(id)
    setSelectedRecording(recording)
  }

  const handleStartRename = (recording: { id: string; name: string }) => {
    setEditingRecordingId(recording.id)
    setEditingName(recording.name)
  }

  const handleCancelRename = () => {
    setEditingRecordingId(null)
    setEditingName('')
  }

  const handleSaveRename = async (id: string) => {
    if (!editingName.trim()) {
      handleCancelRename()
      return
    }

    try {
      console.log('Saving rename:', id, editingName.trim())
      await renameRecording(id, editingName.trim())
      console.log('Rename successful')
      setEditingRecordingId(null)
      setEditingName('')
      setError(null)
    } catch (error) {
      console.error('Failed to rename recording:', error)
      setError(`Failed to rename recording: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString()
  }

  const formatDuration = (startTime: number, endTime: number) => {
    const seconds = Math.floor((endTime - startTime) / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  const getActionTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      browser_navigate: 'Navigate',
      mouse_click: 'Click',
      input_fill: 'Input',
      dropdown_select: 'Select',
      browser_hover: 'Hover',
      browser_screenshot: 'Screenshot',
      browser_evaluate: 'Evaluate',
      browser_set_viewport: 'Viewport',
      tab_open: 'Open Tab',
      tab_change: 'Switch Tab',
      tab_close: 'Close Tab',
    }
    return labels[type] || type
  }

  if (error) {
    return (
      <div className="flex flex-col h-full bg-background p-4">
        <div className="text-destructive">Error: {error}</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden">
      {/* Recording Controls */}
      <div className="p-4 border-b border-border space-y-3 flex-shrink-0 bg-background">
        {recordingsDir && (
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span className="truncate flex-1" title={recordingsDir}>
              {recordingsDir}
            </span>
            <Button
              onClick={openRecordingsFolder}
              variant="ghost"
              size="sm"
              className="h-6 px-2 gap-1"
              title="Open recordings folder"
            >
              <FolderOpen className="h-3 w-3" />
            </Button>
          </div>
        )}
        <div className="flex items-center gap-2">
          {!state.isRecording ? (
            <>
              <input
                type="text"
                placeholder="Recording name (optional)"
                value={recordingName}
                onChange={(e) => setRecordingName(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleStart()
                  }
                }}
              />
              <Button onClick={handleStart} variant="default" className="gap-2">
                <Play className="h-4 w-4" />
                Start
              </Button>
            </>
          ) : (
            <>
              <div className="flex-1 flex items-center gap-2 text-sm text-muted-foreground">
                <div className={cn("h-2 w-2 rounded-full", state.isPaused ? "bg-yellow-500" : "bg-red-500 animate-pulse")} />
                {state.isPaused ? 'Paused' : 'Recording...'}
              </div>
              {state.isPaused ? (
                <Button onClick={resumeRecording} variant="default" className="gap-2">
                  <Play className="h-4 w-4" />
                  Resume
                </Button>
              ) : (
                <Button onClick={pauseRecording} variant="default" className="gap-2">
                  <Pause className="h-4 w-4" />
                  Pause
                </Button>
              )}
              <Button onClick={handleStop} variant="destructive" className="gap-2">
                <Square className="h-4 w-4" />
                Stop
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Recordings List */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {selectedRecording ? (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">{selectedRecording.name}</h3>
              <Button
                onClick={() => setSelectedRecording(null)}
                variant="ghost"
                className="text-sm"
              >
                Back to List
              </Button>
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <div>Started: {formatTime(selectedRecording.startTime)}</div>
              <div>Ended: {formatTime(selectedRecording.endTime)}</div>
              <div>Duration: {formatDuration(selectedRecording.startTime, selectedRecording.endTime)}</div>
              <div>Actions: {selectedRecording.actions.length}</div>
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-foreground">Actions:</h4>
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {selectedRecording.actions.map((action: any, index: number) => (
                  <div
                    key={index}
                    className="p-2 text-xs bg-muted rounded border border-border"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-foreground">
                        {getActionTypeLabel(action.type)}
                      </span>
                      <span className="text-muted-foreground">
                        {new Date(action.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="text-muted-foreground space-y-0.5">
                      {action.url && <div>URL: {action.url}</div>}
                      {action.element && <div>Element: {action.element}</div>}
                      {action.x !== undefined && action.y !== undefined && (
                        <div>Position: ({action.x}, {action.y})</div>
                      )}
                      {action.value !== undefined && <div>Value: {action.value}</div>}
                      {action.isList && <div className="text-primary">List item detected</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-2">
            {recordings.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Circle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No recordings yet</p>
                <p className="text-sm mt-2">Start a recording to capture browser actions</p>
              </div>
            ) : (
              recordings.map((recording) => (
                <div
                  key={recording.id}
                  className={cn(
                    "p-3 border border-border rounded-md transition-colors",
                    editingRecordingId === recording.id ? "cursor-default" : "cursor-pointer hover:bg-muted/50"
                  )}
                  onClick={() => {
                    if (editingRecordingId !== recording.id) {
                      handleLoad(recording.id)
                    }
                  }}
                >
                  <div className="flex items-start justify-between mb-2 gap-2">
                    {editingRecordingId === recording.id ? (
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => {
                            e.stopPropagation()
                            setEditingName(e.target.value)
                          }}
                          onKeyDown={(e) => {
                            e.stopPropagation()
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleSaveRename(recording.id)
                            } else if (e.key === 'Escape') {
                              e.preventDefault()
                              handleCancelRename()
                            }
                          }}
                          onFocus={(e) => e.stopPropagation()}
                          onBlur={(e) => e.stopPropagation()}
                          className="flex-1 px-2 py-1 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                        <Button
                          onClick={async (e) => {
                            e.stopPropagation()
                            e.preventDefault()
                            await handleSaveRename(recording.id)
                          }}
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-primary hover:text-primary"
                          type="button"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          onClick={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                            handleCancelRename()
                          }}
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                          type="button"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <h4 className="font-medium text-foreground flex-1">{recording.name}</h4>
                        <div className="flex items-center gap-1">
                          <Button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleStartRename(recording)
                            }}
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            onClick={(e) => {
                              e.stopPropagation()
                              deleteRecording(recording.id)
                            }}
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTime(recording.startTime)}
                      </div>
                      <div>{recording.actionCount} actions</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

