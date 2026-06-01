import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Bookmark, SlidersHorizontal, Plus, CheckCircle, Circle, MinusCircle, Loader2, ArrowUpDown } from 'lucide-react'
import { problemsApi } from '@/utils/api'
import { useAppStore } from '@/store'
import GenerateModal from './GenerateModal'
import toast from 'react-hot-toast'
import type { Difficulty } from '@/types'

type SortMode = 'default' | 'asc' | 'desc'
const DIFF_ORDER: Record<string, number> = { easy: 0, medium: 1, hard: 2 }
const SORT_LABELS: Record<SortMode, string> = { default: 'Sort: Default', asc: 'Sort: Easy→Hard', desc: 'Sort: Hard→Easy' }
const SORT_CYCLE: Record<SortMode, SortMode> = { default: 'asc', asc: 'desc', desc: 'default' }

const DIFFICULTIES: (Difficulty | 'all')[] = ['all', 'easy', 'medium', 'hard']
const SQL_TOPICS = ['JOIN', 'CTE', 'Window Function', 'Aggregation', 'Subquery', 'GROUP BY', 'Date Functions', 'String Functions', 'Ranking', 'Self JOIN', 'NULL Handling', 'Running Totals']
const PYTHON_TOPICS = ['Python Basics', 'Data Analysis', 'Analytics Engineering', 'Data Science', 'Lists & Dicts', 'Functions', 'Pandas', 'NumPy', 'Data Cleaning']

const diffColors: Record<string, string> = {
  easy: 'text-success', medium: 'text-yellow-400', hard: 'text-error'
}

interface GenerationProbeState {
  baselineCount: number
  startedAt: number
}

function StatusIcon({ status }: { status?: string }) {
  if (status === 'solved') return <CheckCircle size={14} className="text-success shrink-0" />
  if (status === 'attempted') return <MinusCircle size={14} className="text-yellow-400 shrink-0" />
  return <Circle size={14} className="text-gray-600 shrink-0" />
}

export default function ProblemList({ onSelect, selectedId }: { onSelect: (id: string) => void; selectedId?: string }) {
  const { activeProfile, practiceLanguage } = useAppStore()
  const [search, setSearch] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty | 'all'>('all')
  const [topic, setTopic] = useState('')
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false)
  const [showTopics, setShowTopics] = useState(false)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [sortMode, setSortMode] = useState<SortMode>('default')
  const [generationProbe, setGenerationProbe] = useState<GenerationProbeState | null>(null)
  const generationResolvedRef = useRef(false)
  const generationProbeTicketRef = useRef(0)

  const topicOptions = practiceLanguage === 'python' ? PYTHON_TOPICS : SQL_TOPICS

  const { data: problems = [], isLoading, refetch } = useQuery({
    queryKey: ['problems', activeProfile?.id, practiceLanguage, difficulty, topic, bookmarkedOnly, search],
    queryFn: () => problemsApi.list({
      profile_id: activeProfile?.id,
      language: practiceLanguage,
      difficulty: difficulty !== 'all' ? difficulty : undefined,
      topic: topic || undefined,
      search: search || undefined,
      bookmarked: bookmarkedOnly || undefined,
    }),
    enabled: !!activeProfile,
    refetchInterval: false,
  })

  const sorted = sortMode === 'default' ? problems : [...problems].sort((a, b) => {
    const diff = DIFF_ORDER[a.difficulty] - DIFF_ORDER[b.difficulty]
    return sortMode === 'asc' ? diff : -diff
  })
  const solved = problems.filter(p => p.user_status === 'solved').length

  const startGenerationProbe = async () => {
    if (!activeProfile) return
    const ticket = Date.now()
    generationProbeTicketRef.current = ticket
    generationResolvedRef.current = false
    try {
      const snapshot = await problemsApi.list({ profile_id: activeProfile.id, language: practiceLanguage })
      if (generationProbeTicketRef.current !== ticket || generationResolvedRef.current) return
      setGenerationProbe({ baselineCount: snapshot.length, startedAt: Date.now() })
    } catch {
      if (generationProbeTicketRef.current !== ticket || generationResolvedRef.current) return
      setGenerationProbe({ baselineCount: problems.length, startedAt: Date.now() })
    }
  }

  useEffect(() => {
    if (!generationProbe || !activeProfile) return

    let cancelled = false
    const POLL_MS = 3000
    const MAX_WAIT_MS = 5 * 60 * 1000

    const checkForBackgroundSuccess = async () => {
      if (cancelled || generationResolvedRef.current) return
      try {
        const latest = await problemsApi.list({ profile_id: activeProfile.id, language: practiceLanguage })
        if (cancelled || generationResolvedRef.current) return

        if (latest.length > generationProbe.baselineCount) {
          generationResolvedRef.current = true
          toast.success('Problem generated successfully!')
          setGenerationProbe(null)
          setGenerateOpen(false)
          refetch()
          return
        }
      } catch {
        // Silent: probe should be best-effort only.
      }

      if (Date.now() - generationProbe.startedAt > MAX_WAIT_MS) {
        setGenerationProbe(null)
      }
    }

    checkForBackgroundSuccess()
    const intervalId = setInterval(checkForBackgroundSuccess, POLL_MS)

    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [generationProbe, activeProfile, practiceLanguage, refetch])

  return (
    <div className="flex flex-col h-full overflow-x-hidden">
      {/* Header */}
      <div className="p-3 border-b border-dark-border space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400 font-medium">
            {solved}/{problems.length} Solved
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setBookmarkedOnly(!bookmarkedOnly)}
              className={`p-1.5 rounded-lg transition-colors ${bookmarkedOnly ? 'text-primary bg-primary/10' : 'text-gray-500 hover:text-gray-300 hover:bg-dark-hover'}`}
              title="Bookmarked only"
            >
              <Bookmark size={13} />
            </button>
            <button
              onClick={() => setGenerateOpen(true)}
              className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-1 rounded-lg hover:bg-primary/20 transition-colors font-medium"
            >
              <Plus size={12} />
              Generate
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            className="input pl-7 py-1.5 text-xs"
            placeholder="Search problems..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Filters row */}
        <div className="flex items-center gap-1 min-w-0">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            {DIFFICULTIES.map(d => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={`px-1.5 py-0.5 rounded text-xs font-medium transition-colors capitalize shrink-0 ${
                  difficulty === d
                    ? d === 'all' ? 'bg-primary/20 text-primary' : `${diffColors[d]} bg-current/10`
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
          {difficulty === 'all' && (
            <button
              onClick={() => setSortMode(SORT_CYCLE[sortMode])}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors shrink-0 ${sortMode !== 'default' ? 'text-primary bg-primary/10' : 'text-gray-500 hover:text-gray-300'}`}
              title={SORT_LABELS[sortMode]}
            >
              <ArrowUpDown size={11} />
              {sortMode !== 'default' && <span>{sortMode === 'asc' ? 'E→H' : 'H→E'}</span>}
            </button>
          )}
          <button
            onClick={() => setShowTopics(!showTopics)}
            className={`p-1 rounded transition-colors shrink-0 ${showTopics ? 'text-primary' : 'text-gray-500 hover:text-gray-300'}`}
            title="Filter by topic"
          >
            <SlidersHorizontal size={13} />
          </button>
        </div>

        {showTopics && (
          <div className="flex flex-wrap gap-1 mt-1">
            <button
              onClick={() => setTopic('')}
              className={`tag text-xs px-1.5 py-0.5 transition-colors ${!topic ? 'border-primary/50 text-primary' : ''}`}
            >
              All
            </button>
            {topicOptions.map(t => (
              <button
                key={t}
                onClick={() => setTopic(topic === t ? '' : t)}
                className={`tag text-xs px-1.5 py-0.5 transition-colors ${topic === t ? 'border-primary/50 text-primary' : ''}`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Problem list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-primary" />
          </div>
        ) : problems.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm px-4">
            <p>No problems yet.</p>
            <button onClick={() => setGenerateOpen(true)} className="text-primary hover:underline mt-1">
              Generate your first problem →
            </button>
          </div>
        ) : (
          sorted.map(problem => (
            <button
              key={problem.id}
              onClick={() => onSelect(problem.id)}
              className={`w-full text-left px-3 py-2.5 border-b border-dark-border/50 transition-colors ${
                selectedId === problem.id
                  ? 'bg-primary/5 border-l-2 border-l-primary'
                  : 'hover:bg-dark-hover'
              }`}
            >
              <div className="flex items-start gap-2">
                <StatusIcon status={problem.user_status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xs text-gray-500 shrink-0">{problem.problem_number}.</span>
                    <span className="text-sm text-gray-200 truncate leading-tight">{problem.title}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-xs capitalize ${diffColors[problem.difficulty]}`}>
                      {problem.difficulty}
                    </span>
                    {problem.topic_tags?.slice(0, 2).map(tag => (
                      <span key={tag} className="text-xs text-gray-600 truncate">{tag}</span>
                    ))}
                    {problem.is_bookmarked && <Bookmark size={10} className="text-primary ml-auto shrink-0" fill="currentColor" />}
                  </div>
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {generateOpen && (
        <GenerateModal
          onClose={() => setGenerateOpen(false)}
          onGenerated={() => {
            generationResolvedRef.current = true
            generationProbeTicketRef.current = Date.now()
            setGenerationProbe(null)
            refetch()
            setGenerateOpen(false)
          }}
          onGenerationStarted={startGenerationProbe}
        />
      )}
    </div>
  )
}
