import { useState, useEffect, useRef } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { X, Zap, Brain, BarChart2 } from 'lucide-react'
import { problemsApi, datasetsApi } from '@/utils/api'
import { useAppStore } from '@/store'
import toast from 'react-hot-toast'
import type { Difficulty, Dialect } from '@/types'

const SQL_TOPICS = ['Any', 'JOIN', 'CTE', 'Window Function', 'Aggregation', 'Subquery', 'GROUP BY', 'Date Functions', 'String Functions', 'Ranking', 'NULL Handling']
const PYTHON_TOPICS = ['Any', 'Python Basics', 'Data Analysis', 'Analytics Engineering', 'Data Science', 'Lists & Dicts', 'Functions', 'Comprehensions', 'Pandas', 'NumPy', 'Data Cleaning', 'Statistics']
const DIFFICULTIES: (Difficulty | 'any')[] = ['any', 'easy', 'medium', 'hard']
const DIALECTS: Dialect[] = ['mysql', 'postgresql', 'sqlite']

type Tab = 'single' | 'batch' | 'adaptive'

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

function GenerateButton({
  isLoading, progress, progressLabel, elapsedLabel, onClick, disabled, icon, label,
}: {
  isLoading: boolean
  progress: number
  progressLabel: string
  elapsedLabel?: string
  onClick: () => void
  disabled: boolean
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={isLoading || disabled}
      className="relative w-full py-2.5 rounded-lg font-semibold text-sm overflow-hidden transition-colors bg-accent hover:opacity-90 text-accent-fg disabled:opacity-90"
    >
      {/* Progress fill */}
      {isLoading && (
        <div
          className="absolute inset-0 bg-black/20 origin-left transition-all"
          style={{ transform: `scaleX(${progress / 100})`, transitionDuration: progress === 100 ? '200ms' : '800ms', transitionTimingFunction: 'ease-out' }}
        />
      )}
      <span className="relative flex items-center justify-center gap-2">
        {isLoading ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-black animate-bounce [animation-delay:-0.3s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-black animate-bounce [animation-delay:-0.15s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-black animate-bounce" />
            <span className="text-black/80 font-medium">{progressLabel}</span>
            <span className="text-black/60 text-xs">{progress}%</span>
            {elapsedLabel && <span className="text-black/70 text-xs">{elapsedLabel}</span>}
          </>
        ) : (
          <>{icon}{label}</>
        )}
      </span>
    </button>
  )
}

export default function GenerateModal({
  onClose,
  onGenerated,
  onGenerationStarted,
}: {
  onClose: () => void
  onGenerated: () => void
  onGenerationStarted?: () => void
}) {
  const { activeProfile, activeDialect, sqlGenerationJobId, pythonGenerationJobId, setGenerationJobId, practiceLanguage } = useAppStore()
  const activeGenerationJobId = practiceLanguage === 'python' ? pythonGenerationJobId : sqlGenerationJobId
  const setActiveGenerationJobId = (jobId: string | null) => setGenerationJobId(practiceLanguage, jobId)
  const isPython = practiceLanguage === 'python'
  const TOPICS = isPython ? PYTHON_TOPICS : SQL_TOPICS
  const [tab, setTab] = useState<Tab>('single')
  const [topic, setTopic] = useState('Any')
  const [difficulty, setDifficulty] = useState<Difficulty | 'any'>('any')
  const [dialect, setDialect] = useState<Dialect>(activeDialect)
  const [datasetSource, setDatasetSource] = useState<'llm' | 'bundled' | 'uploaded'>('llm')
  const [datasetName, setDatasetName] = useState('')
  const [count, setCount] = useState(1)
  const [naturalLanguage, setNaturalLanguage] = useState('')
  const [pinnedConstraints, setPinnedConstraints] = useState('')
  const [showPinned, setShowPinned] = useState(false)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const completedJobRef = useRef<string | null>(null)

  useEffect(() => {
    // Only resume a job that belongs to this modal's language
    if (!activeJobId && activeGenerationJobId) {
      setActiveJobId(activeGenerationJobId)
    }
  }, [activeJobId, activeGenerationJobId])

  const { data: bundledDatasets = [] } = useQuery({
    queryKey: ['datasets-bundled'],
    queryFn: datasetsApi.bundled,
  })

  const { data: generationJob, error: generationJobError } = useQuery({
    queryKey: ['generation-job', activeJobId, activeProfile?.id],
    queryFn: () => problemsApi.getGenerationJob(activeJobId!, activeProfile?.id),
    enabled: !!activeJobId && !!activeProfile?.id,
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (!status) return 1000
      return (status === 'succeeded' || status === 'failed') ? false : 1200
    },
  })

  const showGenerationError = (e: any, fallback: string) => {
    const status = e?.response?.status
    const detail = e?.response?.data?.detail
    if (status === 409) {
      toast.error('Generation is already in progress. Please wait for it to finish.')
      return
    }
    toast.error(detail || e?.message || fallback)
  }

  const generateSingle = useMutation({
    mutationFn: () => problemsApi.generateJobSingle({
      profile_id: activeProfile!.id,
      language: practiceLanguage,
      topic: topic !== 'Any' ? topic : undefined,
      difficulty: difficulty !== 'any' ? difficulty : undefined,
      dialect,
      dataset_source: datasetSource,
      dataset_name: datasetName || undefined,
      pinned_constraints: pinnedConstraints || undefined,
      count: 1,
    }),
    onSuccess: (job) => {
      completedJobRef.current = null
      setActiveJobId(job.id)
      setActiveGenerationJobId(job.id)
      setProgress(job.progress_percent ?? 0)
    },
    onError: (e: any) => showGenerationError(e, 'Generation failed'),
  })

  const generateBatch = useMutation({
    mutationFn: () => problemsApi.generateJobBatch({
      profile_id: activeProfile!.id,
      language: practiceLanguage,
      topic: topic !== 'Any' ? topic : undefined,
      difficulty: difficulty !== 'any' ? difficulty : undefined,
      dialect,
      dataset_source: datasetSource,
      dataset_name: datasetName || undefined,
      pinned_constraints: pinnedConstraints || undefined,
      count,
    }),
    onSuccess: (job) => {
      completedJobRef.current = null
      setActiveJobId(job.id)
      setActiveGenerationJobId(job.id)
      setProgress(job.progress_percent ?? 0)
    },
    onError: (e: any) => showGenerationError(e, 'Batch generation failed'),
  })

  const generateAdaptive = useMutation({
    mutationFn: () => problemsApi.generateJobAdaptive({
      profile_id: activeProfile!.id,
      language: practiceLanguage,
      dialect,
      natural_language_request: naturalLanguage || undefined,
    }),
    onSuccess: (job) => {
      completedJobRef.current = null
      setActiveJobId(job.id)
      setActiveGenerationJobId(job.id)
      setProgress(job.progress_percent ?? 0)
    },
    onError: (e: any) => showGenerationError(e, 'Generation failed'),
  })

  const isLoading = !!activeJobId || generateSingle.isPending || generateBatch.isPending || generateAdaptive.isPending

  const [progress, setProgress] = useState(0)
  const [nowMs, setNowMs] = useState(Date.now())

  useEffect(() => {
    if (!isLoading) return
    const timer = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [isLoading])

  useEffect(() => {
    if (!generationJob) return

    setProgress(generationJob.progress_percent ?? 0)

    if (completedJobRef.current === generationJob.id) return

    if (generationJob.status === 'succeeded') {
      completedJobRef.current = generationJob.id
      const successCount = generationJob.completed_count
      const failedCount = generationJob.failed_count
      if (generationJob.job_type === 'batch') {
        toast.success(`Generated ${successCount} problems${failedCount ? ` (${failedCount} failed)` : ''}!`)
      } else if (generationJob.job_type === 'adaptive') {
        toast.success('Adaptive problem generated based on your analytics!')
      } else {
        toast.success('Problem generated!')
      }
      if (activeGenerationJobId === generationJob.id) {
        setActiveGenerationJobId(null)
      }
      setActiveJobId(null)
      onGenerated()
      return
    }

    if (generationJob.status === 'failed') {
      completedJobRef.current = generationJob.id
      if (activeGenerationJobId === generationJob.id) {
        setActiveGenerationJobId(null)
      }
      setActiveJobId(null)
      toast.error(generationJob.error_message || generationJob.errors?.[0] || 'Generation failed')
    }
  }, [generationJob, onGenerated, activeGenerationJobId, setActiveGenerationJobId])

  useEffect(() => {
    if (!activeJobId) return
    const status = (generationJobError as any)?.response?.status
    if (status !== 403 && status !== 404 && status !== 410) return
    if (activeJobId && activeGenerationJobId === activeJobId) {
      setActiveGenerationJobId(null)
    }
    setActiveJobId(null)
    completedJobRef.current = activeJobId
    toast.error('Generation job is no longer available. Please start again.')
  }, [generationJobError, activeJobId, activeGenerationJobId, setActiveGenerationJobId])

  const elapsedLabel = (() => {
    if (!isLoading || !generationJob || (generationJob.status !== 'running' && generationJob.status !== 'queued')) return ''
    const jobStartTime = generationJob.started_at || generationJob.created_at
    const startedMs = new Date(jobStartTime).getTime()
    const elapsedMs = Math.max(0, nowMs - startedMs)
    return `Elapsed ${formatElapsed(elapsedMs)}`
  })()

  const progressLabel = (() => {
    if (!generationJob) return '1/1'
    const total = Math.max(1, generationJob.requested_count || 1)
    const current = generationJob.status === 'running'
      ? Math.min(total, Math.max(1, (generationJob.completed_count || 0) + 1))
      : Math.min(total, Math.max(1, generationJob.completed_count || 1))
    return `${current}/${total}`
  })()

  const tabs = [
    { id: 'single' as Tab, label: 'Single', icon: <Zap size={13} /> },
    { id: 'batch' as Tab, label: 'Batch', icon: <BarChart2 size={13} /> },
    { id: 'adaptive' as Tab, label: 'AI Adaptive', icon: <Brain size={13} /> },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-dark-panel border border-dark-border rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-border">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Zap size={16} className="text-accent" /> Generate {isPython ? 'Python' : 'SQL'} Problems
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-dark-border">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors ${
                tab === t.id ? 'text-accent border-b-2 border-accent' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Adaptive tab */}
          {tab === 'adaptive' ? (
            <div className="space-y-4">
              <div className="bg-dark-card rounded-xl p-3 text-sm text-gray-400 border border-dark-border">
                <p className="text-gray-300 font-medium mb-1 flex items-center gap-1.5">
                  <Brain size={14} className="text-primary" /> AI reads your analytics
                </p>
                <p className="text-xs">Generates problems targeting your weak areas automatically.</p>
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1.5 block">Natural language request (optional)</label>
                <textarea
                  className="input resize-none"
                  rows={3}
                  placeholder='e.g. "Give me hard window function problems" or leave empty for auto'
                  value={naturalLanguage}
                  onChange={e => setNaturalLanguage(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1.5 block">{isPython ? 'Runtime' : 'Dialect'}</label>
                {isPython ? (
                  <div className="text-xs text-gray-500 bg-dark-card border border-dark-border rounded-lg px-3 py-2">
                    Python 3 · stdlib + pandas + numpy · 30s timeout
                  </div>
                ) : (
                <div className="flex gap-2">
                  {DIALECTS.map(d => (
                    <button key={d} onClick={() => setDialect(d)}
                      className={`flex-1 py-1.5 rounded-lg text-sm capitalize border transition-colors ${
                        dialect === d ? 'border-accent text-accent bg-accent/10' : 'border-dark-border text-gray-400 hover:border-gray-500'
                      }`}>
                      {d}
                    </button>
                  ))}
                </div>
                )}
              </div>
              <GenerateButton
                isLoading={isLoading}
                progress={progress}
                progressLabel={progressLabel}
                elapsedLabel={elapsedLabel}
                onClick={() => {
                  onGenerationStarted?.()
                  generateAdaptive.mutate()
                }}
                disabled={!activeProfile}
                icon={<Brain size={16} />}
                label="Generate Adaptive Problem"
              />
            </div>
          ) : (
            /* Single / Batch options */
            <div className="space-y-4">
              {tab === 'batch' && (
                <div>
                  <label className="text-sm text-gray-400 mb-1.5 block">Number of problems</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    className="input"
                    value={count}
                    onChange={e => setCount(Math.max(1, Math.min(50, Number(e.target.value))))}
                  />
                </div>
              )}

              {/* Topic */}
              <div>
                <label className="text-sm text-gray-400 mb-1.5 block">Topic</label>
                <div className="flex flex-wrap gap-1.5">
                  {TOPICS.map(t => (
                    <button key={t} onClick={() => setTopic(t)}
                      className={`tag px-2 py-0.5 text-xs transition-colors ${topic === t ? 'border-primary/60 text-primary' : ''}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Difficulty */}
              <div>
                <label className="text-sm text-gray-400 mb-1.5 block">Difficulty</label>
                <div className="flex gap-2">
                  {DIFFICULTIES.map(d => (
                    <button key={d} onClick={() => setDifficulty(d)}
                      className={`flex-1 py-1.5 rounded-lg text-sm capitalize border transition-colors ${
                        difficulty === d
                          ? d === 'easy' ? 'border-success text-success bg-success/10'
                          : d === 'medium' ? 'border-yellow-400 text-yellow-400 bg-yellow-400/10'
                          : d === 'hard' ? 'border-error text-error bg-error/10'
                          : 'border-primary text-primary bg-primary/10'
                          : 'border-dark-border text-gray-400 hover:border-gray-500'
                      }`}>
                      {d === 'any' ? 'Any' : d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dialect — SQL only */}
              {!isPython ? (
              <div>
                <label className="text-sm text-gray-400 mb-1.5 block">SQL Dialect</label>
                <div className="flex gap-2">
                  {DIALECTS.map(d => (
                    <button key={d} onClick={() => setDialect(d)}
                      className={`flex-1 py-1.5 rounded-lg text-sm capitalize border transition-colors ${
                        dialect === d ? 'border-primary text-primary bg-primary/10' : 'border-dark-border text-gray-400 hover:border-gray-500'
                      }`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              ) : (
              <div>
                <label className="text-sm text-gray-400 mb-1.5 block">Runtime</label>
                <div className="text-xs text-gray-500 bg-dark-card border border-dark-border rounded-lg px-3 py-2">
                  Python 3 · stdlib + pandas + numpy · 30s timeout
                </div>
              </div>
              )}

              {/* Dataset source — SQL only */}
              {!isPython && (
              <div>
                <label className="text-sm text-gray-400 mb-1.5 block">Dataset source</label>
                <div className="flex gap-2">
                  {[['llm', 'LLM'], ['bundled', 'Bundled'], ['uploaded', 'CSV Upload']].map(([val, label]) => (
                    <button key={val} onClick={() => setDatasetSource(val as typeof datasetSource)}
                      className={`flex-1 py-1.5 rounded-lg text-xs border transition-colors ${
                        datasetSource === val ? 'border-primary text-primary bg-primary/10' : 'border-dark-border text-gray-400 hover:border-gray-500'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
                {datasetSource === 'bundled' && (
                  <select className="input mt-2" value={datasetName} onChange={e => setDatasetName(e.target.value)}>
                    <option value="">— Pick dataset —</option>
                    {bundledDatasets.map(d => (
                      <option key={d.name} value={d.name}>{d.name.replace(/_/g, ' ')}: {d.description}</option>
                    ))}
                  </select>
                )}
              </div>
              )}
              <div>
                <button
                  onClick={() => setShowPinned(!showPinned)}
                  className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors"
                >
                  ⚙ {showPinned ? 'Hide' : 'Add'} pinned constraints
                </button>
                {showPinned && (
                  <textarea
                    className="input mt-2 resize-none text-xs"
                    rows={2}
                    placeholder='e.g. "Must use the Employees table, force a self-join"'
                    value={pinnedConstraints}
                    onChange={e => setPinnedConstraints(e.target.value)}
                  />
                )}
              </div>

              <GenerateButton
                isLoading={isLoading}
                progress={progress}
                progressLabel={progressLabel}
                elapsedLabel={elapsedLabel}
                onClick={() => {
                  onGenerationStarted?.()
                  if (tab === 'batch') generateBatch.mutate()
                  else generateSingle.mutate()
                }}
                disabled={!activeProfile}
                icon={<Zap size={16} />}
                label={tab === 'batch' ? `Generate ${count} Problems` : 'Generate Problem'}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
