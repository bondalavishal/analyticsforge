import { useState, useRef, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Send, X, Brain, Loader2, Zap, History, Plus, ChevronLeft, PlusCircle } from 'lucide-react'
import { llmApi, problemsApi } from '@/utils/api'
import { useAppStore } from '@/store'
import toast from 'react-hot-toast'
import type { ChatMessage } from '@/types'

function welcomeMessage(language: string): ChatMessage {
  const track = language === 'python' ? 'Python analytics' : 'SQL'
  return {
    role: 'assistant',
    content: `Hi! I'm AnalyticsForge AI 🤖\n\nI can help you find ${track} problems to practice, explain concepts, or generate problems targeting your weak areas.\n\nWhat would you like to work on today?`,
    timestamp: new Date().toISOString(),
  }
}

const QUICK_PROMPTS = [
  'Give me a problem targeting my weak areas',
  'I want to practice window functions',
  'Give me an easy JOIN problem to warm up',
  'What topics should I focus on?',
]

const PYTHON_QUICK_PROMPTS = [
  'Give me a Python problem targeting my weak areas',
  'I want to practice pandas data cleaning',
  'Give me an easy lists and dicts problem to warm up',
  'What Python analytics topics should I focus on?',
]

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function hasProblemsRecommended(content: string): boolean {
  return (
    /Problem\s+\d+[:\.]/.test(content) ||
    /^\d+\.\s+\*\*[A-Z]/m.test(content) ||
    /\*\s+Problem\s+\d+/.test(content) ||
    (/recommend/i.test(content) && /\b(JOIN|Aggregation|CTE|Window Function|Subquery|GROUP BY|Python Basics|Data Analysis|Analytics Engineering|Data Science|Pandas|NumPy|Data Cleaning|Lists|Dicts|Comprehensions)\b/i.test(content) && /\bproblem\b/i.test(content))
  )
}

const GENERATE_INTENT_RE = /show\s+(it\s+)?in\s+(the\s+)?problem|add\s+(to|these\s+to)\s+(my\s+)?problem|generate\s+these|create\s+these|add\s+(it\s+)?to\s+(my\s+)?list/i

export default function AIAssistantSidebar() {
  const { activeProfile, setChatSidebarOpen, chatSessions, activeChatSessionId,
          saveSessionMessages, switchChatSession, newChatSession,
          sqlGenerationJobId, pythonGenerationJobId, setGenerationJobId,
          practiceLanguage } = useAppStore()
  const globalGenerationJobId = practiceLanguage === 'python' ? pythonGenerationJobId : sqlGenerationJobId
  const setGlobalGenerationJobId = (jobId: string | null) => setGenerationJobId(practiceLanguage, jobId)
  const qc = useQueryClient()
  const [showHistory, setShowHistory] = useState(false)
  const [generatingForMsgIdx, setGeneratingForMsgIdx] = useState<number | null>(null)
  const [localGenerationJobId, setLocalGenerationJobId] = useState<string | null>(null)
  const [activeGenerationRequest, setActiveGenerationRequest] = useState<string | undefined>(undefined)
  const completedGenerationJobRef = useRef<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!activeChatSessionId) newChatSession()
  }, [])

  const activeSession = chatSessions.find(s => s.id === activeChatSessionId)
  const welcome = welcomeMessage(practiceLanguage)
  const messages: ChatMessage[] = activeSession?.messages.length
    ? activeSession.messages
    : [welcome]

  const setMessages = (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
    const next = updater(activeSession?.messages ?? [])
    saveSessionMessages(next)
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const { data: generationJob, error: generationJobError } = useQuery({
    queryKey: ['ai-generation-job', localGenerationJobId, activeProfile?.id],
    queryFn: () => problemsApi.getGenerationJob(localGenerationJobId!, activeProfile?.id),
    enabled: !!localGenerationJobId && !!activeProfile?.id,
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (!status) return 1000
      return (status === 'succeeded' || status === 'failed') ? false : 1200
    },
  })

  const chatMutation = useMutation({
    mutationFn: (message: string) => llmApi.chat(activeProfile!.id, message, practiceLanguage),
    onSuccess: (data) => {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response,
        timestamp: new Date().toISOString(),
      }])
    },
    onError: () => {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I had trouble connecting to the LLM. Check your settings and try again.',
        timestamp: new Date().toISOString(),
      }])
    },
  })

  const generateAdaptive = useMutation({
    mutationFn: (payload: { naturalLanguageRequest?: string }) =>
      problemsApi.generateJobAdaptive({
        profile_id: activeProfile!.id,
        language: practiceLanguage,
        dialect: 'mysql',
        natural_language_request: payload.naturalLanguageRequest,
        local_only: true,
      }),
    onSuccess: (job, variables) => {
      completedGenerationJobRef.current = null
      setLocalGenerationJobId(job.id)
      setGlobalGenerationJobId(job.id)
      setActiveGenerationRequest(variables.naturalLanguageRequest)
    },
    onError: (e: any) => {
      setGeneratingForMsgIdx(null)
      toast.error('Generation failed: ' + (e.response?.data?.detail || 'Unknown error'))
    },
  })

  const isGeneratingAdaptive = generateAdaptive.isPending || !!localGenerationJobId

  useEffect(() => {
    if (!generationJob) return
    if (completedGenerationJobRef.current === generationJob.id) return

    if (generationJob.status === 'succeeded') {
      completedGenerationJobRef.current = generationJob.id
      toast.success('Problem added to your list!')
      qc.invalidateQueries({ queryKey: ['problems'] })
      if (!activeGenerationRequest) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: '✅ I generated a new problem tailored to your weak areas! Check the problem list.',
          timestamp: new Date().toISOString(),
        }])
      }
      setGeneratingForMsgIdx(null)
      setActiveGenerationRequest(undefined)
      setLocalGenerationJobId(null)
      if (globalGenerationJobId === generationJob.id) {
        setGlobalGenerationJobId(null)
      }
      return
    }

    if (generationJob.status === 'failed') {
      completedGenerationJobRef.current = generationJob.id
      setGeneratingForMsgIdx(null)
      setActiveGenerationRequest(undefined)
      setLocalGenerationJobId(null)
      if (globalGenerationJobId === generationJob.id) {
        setGlobalGenerationJobId(null)
      }
      toast.error('Generation failed: ' + (generationJob.error_message || generationJob.errors?.[0] || 'Unknown error'))
    }
  }, [generationJob, qc, activeGenerationRequest, globalGenerationJobId, setGlobalGenerationJobId])

  useEffect(() => {
    if (!localGenerationJobId) return
    const status = (generationJobError as any)?.response?.status
    if (status !== 403 && status !== 404 && status !== 410) return
    completedGenerationJobRef.current = localGenerationJobId
    setGeneratingForMsgIdx(null)
    setActiveGenerationRequest(undefined)
    setLocalGenerationJobId(null)
    if (globalGenerationJobId === localGenerationJobId) {
      setGlobalGenerationJobId(null)
    }
    toast.error('Generation job is no longer available. Please try again.')
  }, [generationJobError, localGenerationJobId, globalGenerationJobId, setGlobalGenerationJobId])

  const [input, setInput] = useState('')
  const quickPrompts = practiceLanguage === 'python' ? PYTHON_QUICK_PROMPTS : QUICK_PROMPTS

  const sendMessage = (text: string) => {
    if (!text.trim() || !activeProfile) return
    const base = activeSession?.messages ?? []
    const withWelcome = base.length === 0 ? [welcome] : base
    const next: ChatMessage[] = [...withWelcome, { role: 'user', content: text, timestamp: new Date().toISOString() }]
    saveSessionMessages(next)
    setInput('')

    // Auto-trigger generation if user wants to add problems to list
    if (GENERATE_INTENT_RE.test(text)) {
      const lastAssistantMsg = [...withWelcome].reverse().find(m => m.role === 'assistant')
      if (lastAssistantMsg && hasProblemsRecommended(lastAssistantMsg.content)) {
        if (isGeneratingAdaptive) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: '⏳ A generation is already in progress. I will add new problems when it finishes.',
            timestamp: new Date().toISOString(),
          }])
          return
        }
        generateAdaptive.mutate({ naturalLanguageRequest: lastAssistantMsg.content })
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: '⏳ Generating problems based on my recommendations...',
          timestamp: new Date().toISOString(),
        }])
        return
      }
    }

    chatMutation.mutate(text)
  }

  const handleGenerateFromMsg = (msgIdx: number, content: string) => {
    setGeneratingForMsgIdx(msgIdx)
    generateAdaptive.mutate({ naturalLanguageRequest: content })
  }

  const handleNewChat = () => {
    newChatSession()
    setShowHistory(false)
  }

  const handleSwitchSession = (id: string) => {
    switchChatSession(id)
    setShowHistory(false)
  }

  return (
    <div className="w-80 shrink-0 border-l border-dark-border bg-dark-panel flex flex-col overflow-hidden animate-slide-in h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border shrink-0">
        <div className="flex items-center gap-2">
          <Brain size={16} className="text-primary" />
          <span className="text-sm font-semibold text-white">AI Assistant</span>
          {chatSessions.length > 0 && (
            <span className="text-[10px] bg-dark-card border border-dark-border rounded-full px-1.5 py-0 text-gray-500">
              {chatSessions.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleNewChat}
            className="p-1.5 rounded text-gray-500 hover:text-gray-300 hover:bg-dark-hover transition-colors"
            title="New chat"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`p-1.5 rounded transition-colors ${showHistory ? 'text-primary bg-primary/10' : 'text-gray-500 hover:text-gray-300 hover:bg-dark-hover'}`}
            title="Chat history"
          >
            <History size={14} />
          </button>
          <button onClick={() => setChatSidebarOpen(false)} className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* History panel */}
      {showHistory ? (
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="px-3 py-2 border-b border-dark-border flex items-center gap-2">
            <button onClick={() => setShowHistory(false)} className="text-gray-500 hover:text-gray-300 transition-colors">
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs font-medium text-gray-400">Chat History</span>
            <button onClick={handleNewChat} className="ml-auto text-xs text-primary hover:underline">+ New</button>
          </div>
          {chatSessions.length === 0 ? (
            <p className="text-xs text-gray-600 text-center py-8">No previous sessions</p>
          ) : (
            chatSessions.map(s => (
              <button
                key={s.id}
                onClick={() => handleSwitchSession(s.id)}
                className={`w-full text-left px-3 py-2.5 border-b border-dark-border/50 hover:bg-dark-hover transition-colors ${s.id === activeChatSessionId ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}
              >
                <p className="text-xs text-gray-300 truncate">{s.preview || 'New chat'}</p>
                <p className="text-[10px] text-gray-600 mt-0.5">{formatRelative(s.updatedAt)} · {s.messages.length} messages</p>
              </button>
            ))
          )}
        </div>
      ) : (
        <>
          {/* Quick prompts */}
          <div className="px-3 py-2 border-b border-dark-border shrink-0">
            <p className="text-xs text-gray-500 mb-1.5">Quick prompts:</p>
            <div className="flex flex-wrap gap-1">
              {quickPrompts.map(p => (
                <button
                  key={p}
                  onClick={() => sendMessage(p)}
                  className="text-xs bg-dark-card border border-dark-border rounded-full px-2 py-0.5 text-gray-400 hover:text-primary hover:border-primary/40 transition-colors"
                >
                  {p.length > 30 ? p.slice(0, 28) + '…' : p}
                </button>
              ))}
            </div>
          </div>

          {/* Generate adaptive button */}
          <div className="px-3 py-2 border-b border-dark-border shrink-0">
              <button
              onClick={() => generateAdaptive.mutate({ naturalLanguageRequest: undefined })}
              disabled={isGeneratingAdaptive}
              className="w-full flex items-center justify-center gap-2 text-xs bg-primary/10 text-primary border border-primary/30 rounded-lg py-2 hover:bg-primary/20 transition-colors"
            >
              {isGeneratingAdaptive && generatingForMsgIdx === null
                ? <Loader2 size={12} className="animate-spin" />
                : <Zap size={12} />}
              Generate problem for my weak areas
            </button>
          </div>

          {/* Messages — scrollable, direct flex child so flex-1 resolves against calc(100vh-3rem) */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ minHeight: 0 }}>
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] ${msg.role === 'user' ? '' : 'w-full'}`}>
                  <div className={`rounded-xl px-3 py-2 text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary/20 text-gray-200 rounded-br-sm'
                      : 'bg-dark-card border border-dark-border text-gray-300 rounded-bl-sm'
                  }`}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                  {/* Add-to-list button for recommendation messages */}
                  {msg.role === 'assistant' && hasProblemsRecommended(msg.content) && (
                    <button
                      onClick={() => handleGenerateFromMsg(i, msg.content)}
                      disabled={isGeneratingAdaptive}
                      className="mt-1.5 w-full flex items-center justify-center gap-1.5 text-[11px] px-3 py-1.5 bg-primary/10 text-primary border border-primary/30 rounded-lg hover:bg-primary/20 transition-colors disabled:opacity-50"
                    >
                      {generatingForMsgIdx === i
                        ? <Loader2 size={11} className="animate-spin" />
                        : <PlusCircle size={11} />}
                      {generatingForMsgIdx === i ? 'Generating…' : 'Add to my problem list'}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {chatMutation.isPending && (
              <div className="flex justify-start">
                <div className="bg-dark-card border border-dark-border rounded-xl px-3 py-2">
                  <Loader2 size={14} className="animate-spin text-primary" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-dark-border shrink-0">
            <div className="flex gap-2">
              <input
                className="input flex-1 text-xs py-2"
                placeholder="Ask me anything..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
                disabled={chatMutation.isPending}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || chatMutation.isPending || !activeProfile}
                className="p-2 bg-primary rounded-lg text-black hover:bg-primary-600 transition-colors disabled:opacity-50"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
