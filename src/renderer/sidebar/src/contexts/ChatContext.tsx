import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'

interface Message {
    id: string
    role: 'user' | 'assistant' | 'reasoning'
    content: string
    timestamp: number
    isStreaming?: boolean
}

interface ReasoningUpdate {
    type: 'planning' | 'executing' | 'completed' | 'error'
    content: string
    stepNumber?: number
    toolName?: string
}

interface ConfirmationRequest {
    id: string
    step: {
        stepNumber: number
        tool: string
        parameters: Record<string, any>
        reasoning: string
        requiresConfirmation: boolean
    }
}

interface ActionPlan {
    goal: string
    steps: Array<{
        stepNumber: number
        tool: string
        parameters: Record<string, any>
        reasoning: string
        requiresConfirmation: boolean
    }>
}

interface GuidanceRequest {
    id: string
    message: string
    elementType: string
    stepNumber: number
}

interface ChatContextType {
    messages: Message[]
    isLoading: boolean
    reasoning: ReasoningUpdate[]
    confirmationRequest: ConfirmationRequest | null
    guidanceRequest: GuidanceRequest | null
    actionPlan: ActionPlan | null
    currentStep: number | null

    // Chat actions
    sendMessage: (content: string) => Promise<void>
    clearChat: () => void

    // Page content access
    getPageContent: () => Promise<string | null>
    getPageText: () => Promise<string | null>
    getCurrentUrl: () => Promise<string | null>

    // Agent actions
    handleConfirmation: (id: string, confirmed: boolean) => void
    handleGuidanceResponse: (id: string, selector?: string, elementInfo?: any, cancelled?: boolean) => void
}

const ChatContext = createContext<ChatContextType | null>(null)

export const useChat = () => {
    const context = useContext(ChatContext)
    if (!context) {
        throw new Error('useChat must be used within a ChatProvider')
    }
    return context
}

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [messages, setMessages] = useState<Message[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [reasoning, setReasoning] = useState<ReasoningUpdate[]>([])
    const [confirmationRequest, setConfirmationRequest] = useState<ConfirmationRequest | null>(null)
    const [guidanceRequest, setGuidanceRequest] = useState<GuidanceRequest | null>(null)
    const [actionPlan, setActionPlan] = useState<ActionPlan | null>(null)
    const [currentStep, setCurrentStep] = useState<number | null>(null)

    // Load initial messages from main process
    useEffect(() => {
        const loadMessages = async () => {
            try {
                const storedMessages = await window.sidebarAPI.getMessages()
                if (storedMessages && storedMessages.length > 0) {
                    // Convert CoreMessage format to our frontend Message format
                    const convertedMessages = storedMessages.map((msg: any, index: number) => ({
                        id: `msg-${index}`,
                        role: msg.role,
                        content: typeof msg.content === 'string' 
                            ? msg.content 
                            : msg.content.find((p: any) => p.type === 'text')?.text || '',
                        timestamp: Date.now(),
                        isStreaming: false
                    }))
                    setMessages(convertedMessages)
                }
            } catch (error) {
                console.error('Failed to load messages:', error)
            }
        }
        loadMessages()
    }, [])

    const sendMessage = useCallback(async (content: string) => {
        setIsLoading(true)
        // Clear previous reasoning and plan when starting a new request
        setReasoning([])
        setActionPlan(null)
        setCurrentStep(null)

        try {
            const messageId = Date.now().toString()

            // Send message to main process (which will handle context)
            await window.sidebarAPI.sendChatMessage({
                message: content,
                messageId: messageId
            })

            // Messages will be updated via the chat-messages-updated event
        } catch (error) {
            console.error('Failed to send message:', error)
        } finally {
            setIsLoading(false)
        }
    }, [])

    const clearChat = useCallback(async () => {
        try {
            await window.sidebarAPI.clearChat()
            setMessages([])
            setReasoning([])
            setConfirmationRequest(null)
            setActionPlan(null)
            setCurrentStep(null)
        } catch (error) {
            console.error('Failed to clear chat:', error)
        }
    }, [])

    const getPageContent = useCallback(async () => {
        try {
            return await window.sidebarAPI.getPageContent()
        } catch (error) {
            console.error('Failed to get page content:', error)
            return null
        }
    }, [])

    const getPageText = useCallback(async () => {
        try {
            return await window.sidebarAPI.getPageText()
        } catch (error) {
            console.error('Failed to get page text:', error)
            return null
        }
    }, [])

    const getCurrentUrl = useCallback(async () => {
        try {
            return await window.sidebarAPI.getCurrentUrl()
        } catch (error) {
            console.error('Failed to get current URL:', error)
            return null
        }
    }, [])

    const handleConfirmation = useCallback((id: string, confirmed: boolean) => {
        window.sidebarAPI.sendAgentConfirmationResponse({ id, confirmed })
        setConfirmationRequest(null)
    }, [])

    const handleGuidanceResponse = useCallback((id: string, selector?: string, elementInfo?: any, cancelled?: boolean) => {
        window.sidebarAPI.sendAgentGuidanceResponse({ id, selector, elementInfo, cancelled })
        setGuidanceRequest(null)
    }, [])

    // Set up message listeners
    useEffect(() => {
        // Track streaming message state
        let currentStreamingMessageId: string | null = null
        let accumulatedContent = ''

        // Listen for streaming response updates
        const handleChatResponse = (data: { messageId: string; content: string; isComplete: boolean }) => {
            console.log(`[ChatContext] Received chat-response:`, {
                messageId: data.messageId,
                contentLength: data.content?.length,
                isComplete: data.isComplete,
                contentPreview: data.content?.substring(0, 50)
            })

            // Handle streaming content
            if (data.content) {
                // If this is a new message or same streaming message, accumulate content
                if (currentStreamingMessageId === null || currentStreamingMessageId === data.messageId) {
                    if (currentStreamingMessageId === null) {
                        // New streaming message started
                        currentStreamingMessageId = data.messageId
                        accumulatedContent = data.content
                    } else {
                        // Continue accumulating (content is already the new delta in some cases)
                        // The agent sends accumulated content, so use it directly if larger
                        if (data.content.length > accumulatedContent.length) {
                            accumulatedContent = data.content
                        } else {
                            accumulatedContent += data.content
                        }
                    }

                    // Update or add the assistant message
                    setMessages(prev => {
                        const existingAssistantIdx = prev.findIndex(
                            m => m.role === 'assistant' && m.id === `streaming-${data.messageId}`
                        )

                        if (existingAssistantIdx >= 0) {
                            // Update existing streaming message
                            const updated = [...prev]
                            updated[existingAssistantIdx] = {
                                ...updated[existingAssistantIdx],
                                content: accumulatedContent,
                                isStreaming: !data.isComplete
                            }
                            return updated
                        } else {
                            // Add new assistant message (streaming)
                            return [...prev, {
                                id: `streaming-${data.messageId}`,
                                role: 'assistant' as const,
                                content: accumulatedContent,
                                timestamp: Date.now(),
                                isStreaming: !data.isComplete
                            }]
                        }
                    })
                }
            }

            if (data.isComplete) {
                // Streaming complete - finalize the message
                setMessages(prev => {
                    return prev.map(m => {
                        if (m.id === `streaming-${data.messageId}`) {
                            return { ...m, isStreaming: false }
                        }
                        return m
                    })
                })
                // Reset streaming state
                currentStreamingMessageId = null
                accumulatedContent = ''
                setIsLoading(false)
            }
        }

        // Listen for message updates from main process (for non-agent mode / history sync)
        const handleMessagesUpdated = (updatedMessages: any[]) => {
            // Convert CoreMessage format to our frontend Message format
            const convertedMessages = updatedMessages.map((msg: any, index: number) => ({
                id: `msg-${index}`,
                role: msg.role,
                content: typeof msg.content === 'string' 
                    ? msg.content 
                    : msg.content.find((p: any) => p.type === 'text')?.text || '',
                timestamp: Date.now(),
                isStreaming: false
            }))
            setMessages(convertedMessages)
        }

        // Listen for agent reasoning updates - render immediately
        const handleReasoningUpdate = (update: ReasoningUpdate) => {
            console.log(`[ChatContext] Received reasoning update:`, {
                type: update.type,
                content: update.content?.substring(0, 50),
                stepNumber: update.stepNumber
            })
            
            // Only accept known reasoning types - filter out any garbage
            const validTypes = ['planning', 'executing', 'completed', 'error', 'warning', 'info']
            if (!validTypes.includes(update.type)) {
                console.warn(`[ChatContext] Ignoring unknown reasoning type: ${update.type}`)
                return
            }
            
            // Use functional update to ensure we get the latest state
            setReasoning((prev) => {
                // Check if this is a duplicate (same content and type)
                const isDuplicate = prev.some(u => 
                    u.type === update.type && 
                    u.content === update.content && 
                    u.stepNumber === update.stepNumber
                );
                
                if (isDuplicate) {
                    return prev; // Don't add duplicates
                }
                
                // Add the new update immediately
                const updated = [...prev, update]
                
                // Extract action plan from planning updates
                if (update.type === 'planning' && update.content.includes('Created plan')) {
                    // Try to extract plan info from the reasoning
                    // The plan details will come from the agent, but for now we track step numbers
                }
                
                // Track current step from executing updates
                if (update.type === 'executing' && update.stepNumber) {
                    setCurrentStep(update.stepNumber)
                }
                
                return updated
            })
        }

        // Listen for agent confirmation requests
        const handleConfirmationRequest = (request: ConfirmationRequest) => {
            setConfirmationRequest(request)
            // Update current step from confirmation request
            if (request.step) {
                setCurrentStep(request.step.stepNumber)
            }
        }

        // Listen for action plan updates
        const handleActionPlan = (plan: ActionPlan) => {
            setActionPlan(plan)
        }

        // Listen for current step updates
        const handleCurrentStep = (step: number) => {
            setCurrentStep(step)
        }

        // Listen for guidance requests
        const handleGuidanceRequest = (request: GuidanceRequest) => {
            setGuidanceRequest(request)
            if (request.stepNumber) {
                setCurrentStep(request.stepNumber)
            }
        }

        window.sidebarAPI.onChatResponse(handleChatResponse)
        window.sidebarAPI.onMessagesUpdated(handleMessagesUpdated)
        window.sidebarAPI.onAgentReasoningUpdate(handleReasoningUpdate)
        window.sidebarAPI.onAgentConfirmationRequest(handleConfirmationRequest)
        window.sidebarAPI.onAgentActionPlan(handleActionPlan)
        window.sidebarAPI.onAgentCurrentStep(handleCurrentStep)
        window.sidebarAPI.onAgentGuidanceRequest(handleGuidanceRequest)

        return () => {
            window.sidebarAPI.removeChatResponseListener()
            window.sidebarAPI.removeMessagesUpdatedListener()
            window.sidebarAPI.removeAgentReasoningListener()
            window.sidebarAPI.removeAgentConfirmationListener()
            window.sidebarAPI.removeAgentActionPlanListener()
            window.sidebarAPI.removeAgentCurrentStepListener()
            window.sidebarAPI.removeAgentGuidanceListener()
        }
    }, [])

    const value: ChatContextType = {
        messages,
        isLoading,
        reasoning,
        confirmationRequest,
        guidanceRequest,
        actionPlan,
        currentStep,
        sendMessage,
        clearChat,
        getPageContent,
        getPageText,
        getCurrentUrl,
        handleConfirmation,
        handleGuidanceResponse
    }

    return (
        <ChatContext.Provider value={value}>
            {children}
        </ChatContext.Provider>
    )
}

