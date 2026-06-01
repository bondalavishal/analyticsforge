import { useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { problemsApi } from '@/utils/api'
import { useAppStore } from '@/store'
import ProblemList from '@/components/problems/ProblemList'
import ProblemDescription from '@/components/problems/ProblemDescription'
import EditorPanel from '@/components/editor/EditorPanel'

export default function ProblemsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { activeProfile, activeProblem, setActiveProblem, practiceLanguage } = useAppStore()

  const prevLanguage = useRef(practiceLanguage)

  useEffect(() => {
    if (prevLanguage.current !== practiceLanguage) {
      navigate('/problems', { replace: true })
      prevLanguage.current = practiceLanguage
    }
  }, [practiceLanguage, navigate])

  const { data: problem } = useQuery({
    queryKey: ['problem', id, activeProfile?.id],
    queryFn: () => problemsApi.get(id!, activeProfile?.id),
    enabled: !!id && !!activeProfile,
  })

  useEffect(() => {
    if (problem) setActiveProblem(problem)
  }, [problem, setActiveProblem])

  const handleSelectProblem = (problemId: string) => {
    navigate(`/problems/${problemId}`)
  }

  return (
    <div className="flex h-[calc(100vh-48px)] overflow-hidden">
      {/* Left: Problem List */}
      <div className="w-[280px] shrink-0 border-r border-dark-border overflow-y-auto bg-dark-panel">
        <ProblemList onSelect={handleSelectProblem} selectedId={id} />
      </div>

      {/* Middle: Description */}
      <div className="flex-1 min-w-0 border-r border-dark-border overflow-y-auto">
        {activeProblem ? (
          <ProblemDescription problem={activeProblem} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4">
            <div className="text-5xl">⚡</div>
            <div className="text-center">
              <p className="font-medium text-gray-400">Select a problem to begin</p>
              <p className="text-sm mt-1">Or generate new ones with AI</p>
            </div>
          </div>
        )}
      </div>

      {/* Right: Editor */}
      <div className="flex-1 min-w-0 flex flex-col">
        <EditorPanel />
      </div>
    </div>
  )
}
