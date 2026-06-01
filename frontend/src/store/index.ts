import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Profile, Problem, Dialect, Theme, ChatMessage, ChatSession, SubmissionResult, PracticeLanguage } from '@/types'
import { defaultEditorContent } from '@/utils/language'

function newSession(messages?: ChatMessage[]): ChatSession {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    messages: messages ?? [],
    preview: '',
  }
}

function applyPracticeLanguageClass(language: PracticeLanguage) {
  document.documentElement.classList.remove('mode-sql', 'mode-python')
  document.documentElement.classList.add(language === 'python' ? 'mode-python' : 'mode-sql')
}

interface AppStore {
  activeProfile: Profile | null
  setActiveProfile: (profile: Profile | null) => void

  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void

  practiceLanguage: PracticeLanguage
  setPracticeLanguage: (language: PracticeLanguage) => void

  activeProblem: Problem | null
  setActiveProblem: (problem: Problem | null) => void

  activeDialect: Dialect
  setDialect: (dialect: Dialect) => void

  editorSQL: string
  setEditorSQL: (sql: string) => void

  chatSidebarOpen: boolean
  setChatSidebarOpen: (open: boolean) => void
  hintsRevealed: number
  setHintsRevealed: (n: number) => void
  resetHints: () => void

  chatSessions: ChatSession[]
  activeChatSessionId: string
  saveSessionMessages: (messages: ChatMessage[]) => void
  switchChatSession: (id: string) => void
  newChatSession: () => void

  markActiveProblemSolved: () => void

  lastSubmitResult: SubmissionResult | null
  setLastSubmitResult: (result: SubmissionResult | null) => void

  sqlGenerationJobId: string | null
  pythonGenerationJobId: string | null
  setGenerationJobId: (language: PracticeLanguage, jobId: string | null) => void
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      activeProfile: null,
      setActiveProfile: (profile) => set({ activeProfile: profile }),

      theme: 'dark',
      setTheme: (theme) => {
        set({ theme })
        if (theme === 'dark') {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
      },
      toggleTheme: () => {
        const next: Theme = get().theme === 'dark' ? 'light' : 'dark'
        get().setTheme(next)
      },

      practiceLanguage: 'sql',
      setPracticeLanguage: (language) => {
        applyPracticeLanguageClass(language)
        set({
          practiceLanguage: language,
          activeProblem: null,
          editorSQL: defaultEditorContent(language),
          hintsRevealed: 0,
          lastSubmitResult: null,
        })
      },

      activeProblem: null,
      setActiveProblem: (problem) => {
        const lang = (problem?.language || get().practiceLanguage) as PracticeLanguage
        const starter = problem?.language === 'python'
          ? (problem.starter_code || defaultEditorContent('python'))
          : defaultEditorContent('sql')
        set({
          activeProblem: problem,
          editorSQL: starter,
          hintsRevealed: 0,
          lastSubmitResult: null,
          practiceLanguage: lang,
        })
        applyPracticeLanguageClass(lang)
      },

      activeDialect: 'mysql',
      setDialect: (dialect) => set({ activeDialect: dialect }),

      editorSQL: defaultEditorContent('sql'),
      setEditorSQL: (sql) => set({ editorSQL: sql }),

      chatSidebarOpen: false,
      setChatSidebarOpen: (open) => set({ chatSidebarOpen: open }),

      hintsRevealed: 0,
      setHintsRevealed: (n) => set({ hintsRevealed: n }),
      resetHints: () => set({ hintsRevealed: 0 }),

      chatSessions: [],
      activeChatSessionId: '',
      saveSessionMessages: (messages) => {
        const { chatSessions, activeChatSessionId } = get()
        const firstUserMsg = messages.find(m => m.role === 'user')
        const preview = firstUserMsg ? firstUserMsg.content.slice(0, 60) : 'New chat'
        const now = new Date().toISOString()

        const existing = chatSessions.find(s => s.id === activeChatSessionId)
        if (existing) {
          set({
            chatSessions: chatSessions.map(s =>
              s.id === activeChatSessionId
                ? { ...s, messages, preview, updatedAt: now }
                : s
            ),
          })
        } else {
          const session: ChatSession = { id: activeChatSessionId, createdAt: now, updatedAt: now, messages, preview }
          set({ chatSessions: [session, ...chatSessions].slice(0, 30) })
        }
      },
      switchChatSession: (id) => set({ activeChatSessionId: id }),
      newChatSession: () => {
        const session = newSession()
        const { chatSessions } = get()
        set({ chatSessions: [session, ...chatSessions].slice(0, 30), activeChatSessionId: session.id })
      },

      markActiveProblemSolved: () => {
        const { activeProblem } = get()
        if (activeProblem) set({ activeProblem: { ...activeProblem, user_status: 'solved' } })
      },

      lastSubmitResult: null,
      setLastSubmitResult: (result) => set({ lastSubmitResult: result }),

      sqlGenerationJobId: null,
      pythonGenerationJobId: null,
      setGenerationJobId: (language: PracticeLanguage, jobId: string | null) => set(
        language === 'python'
          ? { pythonGenerationJobId: jobId }
          : { sqlGenerationJobId: jobId }
      ),
    }),
    {
      name: 'analyticsforge-store',
      partialize: (state) => ({
        activeProfile: state.activeProfile,
        theme: state.theme,
        practiceLanguage: state.practiceLanguage,
        activeDialect: state.activeDialect,
        chatSessions: state.chatSessions,
        activeChatSessionId: state.activeChatSessionId,
        sqlGenerationJobId: state.sqlGenerationJobId,
        pythonGenerationJobId: state.pythonGenerationJobId,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.practiceLanguage) {
          applyPracticeLanguageClass(state.practiceLanguage)
        } else {
          applyPracticeLanguageClass('sql')
        }
      },
    }
  )
)
