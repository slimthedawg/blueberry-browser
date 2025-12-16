import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'

interface RecordingState {
  isRecording: boolean
  isPaused: boolean
  recordingId: string | null
}

interface Recording {
  id: string
  name: string
  startTime: number
  endTime: number
  actionCount: number
}

interface RecordingContextType {
  state: RecordingState
  recordings: Recording[]
  startRecording: (name?: string) => Promise<void>
  stopRecording: () => Promise<void>
  pauseRecording: () => Promise<void>
  resumeRecording: () => Promise<void>
  loadRecordings: () => Promise<void>
  loadRecording: (id: string) => Promise<any>
  deleteRecording: (id: string) => Promise<void>
  renameRecording: (id: string, newName: string) => Promise<void>
}

const RecordingContext = createContext<RecordingContextType | undefined>(undefined)

export const useRecording = () => {
  const context = useContext(RecordingContext)
  if (!context) {
    throw new Error('useRecording must be used within a RecordingProvider')
  }
  return context
}

export const RecordingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<RecordingState>({
    isRecording: false,
    isPaused: false,
    recordingId: null,
  })
  const [recordings, setRecordings] = useState<Recording[]>([])

  // Load initial state and recordings
  useEffect(() => {
    loadState()
    loadRecordings()
  }, [])

  const loadState = useCallback(async () => {
    try {
      if (!window.sidebarAPI || !window.sidebarAPI.recordingGetState) {
        console.error('Recording API not available')
        return
      }
      const currentState = await window.sidebarAPI.recordingGetState()
      setState(currentState)
    } catch (error) {
      console.error('Failed to load recording state:', error)
    }
  }, [])

  const loadRecordings = useCallback(async () => {
    try {
      if (!window.sidebarAPI || !window.sidebarAPI.recordingGetList) {
        console.error('Recording API not available')
        return
      }
      const list = await window.sidebarAPI.recordingGetList()
      setRecordings(list || [])
    } catch (error) {
      console.error('Failed to load recordings:', error)
      setRecordings([])
    }
  }, [])

  const startRecording = useCallback(async (name?: string) => {
    try {
      const result = await window.sidebarAPI.recordingStart(name)
      if (result.success) {
        setState({
          isRecording: true,
          isPaused: false,
          recordingId: result.id || null,
        })
      }
    } catch (error) {
      console.error('Failed to start recording:', error)
    }
  }, [])

  const stopRecording = useCallback(async () => {
    try {
      const result = await window.sidebarAPI.recordingStop()
      if (result.success) {
        setState({
          isRecording: false,
          isPaused: false,
          recordingId: null,
        })
        // Reload recordings list
        await loadRecordings()
      }
    } catch (error) {
      console.error('Failed to stop recording:', error)
    }
  }, [loadRecordings])

  const pauseRecording = useCallback(async () => {
    try {
      const result = await window.sidebarAPI.recordingPause()
      if (result.success) {
        setState((prev) => ({ ...prev, isPaused: true }))
      }
    } catch (error) {
      console.error('Failed to pause recording:', error)
    }
  }, [])

  const resumeRecording = useCallback(async () => {
    try {
      const result = await window.sidebarAPI.recordingResume()
      if (result.success) {
        setState((prev) => ({ ...prev, isPaused: false }))
      }
    } catch (error) {
      console.error('Failed to resume recording:', error)
    }
  }, [])

  const loadRecording = useCallback(async (id: string) => {
    try {
      return await window.sidebarAPI.recordingLoad(id)
    } catch (error) {
      console.error('Failed to load recording:', error)
      return null
    }
  }, [])

  const deleteRecording = useCallback(async (id: string) => {
    try {
      await window.sidebarAPI.recordingDelete(id)
      await loadRecordings()
    } catch (error) {
      console.error('Failed to delete recording:', error)
    }
  }, [loadRecordings])

  const renameRecording = useCallback(async (id: string, newName: string) => {
    try {
      await window.sidebarAPI.recordingRename(id, newName)
      await loadRecordings()
    } catch (error) {
      console.error('Failed to rename recording:', error)
      throw error
    }
  }, [loadRecordings])

  return (
    <RecordingContext.Provider
      value={{
        state,
        recordings,
        startRecording,
        stopRecording,
        pauseRecording,
        resumeRecording,
        loadRecordings,
        loadRecording,
        deleteRecording,
        renameRecording,
      }}
    >
      {children}
    </RecordingContext.Provider>
  )
}

