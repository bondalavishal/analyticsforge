import { useState, useRef, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Play, Upload, RotateCcw, ChevronDown, ChevronUp, Lightbulb, Loader2, CheckCircle, XCircle, ShieldCheck, X } from 'lucide-react'
import { submissionsApi, llmApi, problemsApi } from '@/utils/api'
import { useAppStore } from '@/store'
import MonacoSQLEditor from './MonacoSQLEditor'
import ResultTable from './ResultTable'
import toast from 'react-hot-toast'
import type { RunResult, SubmissionResult, TestCaseDetail, QCResult, PythonExpectedOutput, QueryResult } from '@/types'
import { defaultEditorContent, trackLabel } from '@/utils/language'

function asQueryResult(v: unknown): QueryResult {
  return (v || { columns: [], rows: [] }) as QueryResult
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'object') return JSON.stringify(v, null, 2)
  return String(v)
}

function getExpected(tc: TestCaseDetail): unknown {
  const e = tc.expected as { value?: unknown; columns?: string[]; rows?: unknown[][] }
  if (e && 'value' in e) return e.value
  return e
}

function getActual(tc: TestCaseDetail): unknown {
  const a = tc.actual as { value?: unknown; columns?: string[]; rows?: unknown[][] }
  if (a && 'value' in a) return a.value
  return a
}

const DIALECTS = ['mysql', 'postgresql', 'sqlite'] as const

export default function EditorPanel() {
  const { activeProblem, activeProfile, activeDialect, setDialect, editorSQL, setEditorSQL, hintsRevealed, setHintsRevealed, markActiveProblemSolved, setLastSubmitResult, practiceLanguage } = useAppStore()
  const isPython = (activeProblem?.language || practiceLanguage) === 'python'
  const [dialect, setLocalDialect] = useState<typeof DIALECTS[number]>(activeDialect)
  const [runResult, setRunResult] = useState<RunResult | null>(null)
  const [submitResult, setSubmitResult] = useState<SubmissionResult | null>(null)
  const [hintsOpen, setHintsOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState(true)
  const [activeTab, setActiveTab] = useState<'testcase' | 'result'>('testcase')
  const startTimeRef = useRef(Date.now())
  useEffect(() => { startTimeRef.current = Date.now() }, [activeProblem?.id])
  const [qcResult, setQcResult] = useState<QCResult | null>(null)
  const [qcOpen, setQcOpen] = useState(false)
  const qc = useQueryClient()

  const runMutation = useMutation({
    mutationFn: () => submissionsApi.run({
      profile_id: activeProfile!.id,
      problem_id: activeProblem!.id,
      sql: editorSQL,
      dialect,
    }),
    onSuccess: (data) => {
      setRunResult(data)
      setSubmitResult(null)
      setActiveTab('result')
      setResultOpen(true)
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Run failed'),
  })

  const submitMutation = useMutation({
    mutationFn: () => submissionsApi.submit({
      profile_id: activeProfile!.id,
      problem_id: activeProblem!.id,
      sql: editorSQL,
      dialect,
      time_spent_seconds: Math.floor((Date.now() - startTimeRef.current) / 1000),
    }),
    onSuccess: (data) => {
      setSubmitResult(data)
      setLastSubmitResult(data)
      setRunResult(null)
      setResultOpen(true)
      if (data.status === 'accepted') {
        markActiveProblemSolved()
        qc.invalidateQueries({ queryKey: ['problems'] })
        qc.invalidateQueries({ queryKey: ['submissions'] })
        setActiveTab('result')
        if (data.all_passed) {
          toast.success('🎉 Submitted successfully! All test cases passed.')
        } else {
          toast.success(`✅ Submitted successfully! ${data.test_cases_passed}/${data.test_cases_total} test cases passed.`)
        }
      } else {
        setActiveTab('testcase')
        toast.error(data.status === 'error' ? `Error — ${data.error_message}` : `Wrong Answer — ${data.test_cases_passed}/${data.test_cases_total} passed`)
      }
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Submit failed'),
  })

  const qcMutation = useMutation({
    mutationFn: () => problemsApi.qc(activeProblem!.id),
    onSuccess: (data) => {
      setQcResult(data)
      setQcOpen(true)
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'QC check failed'),
  })

  const hintMutation = useMutation({
    mutationFn: () => llmApi.getHint(activeProblem!.id, activeProfile!.id, hintsRevealed),
    onSuccess: (data) => {
      setHintsRevealed(data.hint_index + 1)
      setHintsOpen(true)
    },
  })

  const handleDialectChange = (d: typeof DIALECTS[number]) => {
    setLocalDialect(d)
    setDialect(d)
  }

  const isLoading = runMutation.isPending || submitMutation.isPending
  const canRun = !!activeProblem && !!activeProfile && !!editorSQL.trim()
  const hints = activeProblem?.hints || []

  return (
    <div className="flex flex-col h-full bg-dark-bg">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-dark-border bg-dark-panel shrink-0">
        <span className="text-xs font-medium text-gray-400 bg-dark-card border border-dark-border px-2 py-1 rounded uppercase">
          {trackLabel(isPython ? 'python' : 'sql')}
        </span>

        {!isPython && (
        <select
          value={dialect}
          onChange={e => handleDialectChange(e.target.value as typeof DIALECTS[number])}
          className="text-xs bg-dark-card border border-dark-border rounded px-2 py-1 text-gray-400"
        >
          {DIALECTS.map(d => <option key={d} value={d}>{d.toUpperCase()}</option>)}
        </select>
        )}

        <div className="flex-1" />

        {/* Reset */}
        <button
          onClick={() => setEditorSQL(isPython
            ? (activeProblem?.starter_code || defaultEditorContent('python'))
            : defaultEditorContent('sql'))}
          className="btn-ghost p-1.5"
          title="Reset editor"
        >
          <RotateCcw size={14} />
        </button>

        {/* Hints */}
        {hints.length > 0 && (
          <button
            onClick={() => hintMutation.mutate()}
            disabled={hintsRevealed >= hints.length || hintMutation.isPending}
            className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              hintsRevealed >= hints.length
                ? 'border-dark-border text-gray-600 cursor-not-allowed'
                : 'border-yellow-400/40 text-yellow-400 hover:bg-yellow-400/10'
            }`}
            title={hintsRevealed >= hints.length ? 'All hints revealed' : `Hint ${hintsRevealed + 1}/${hints.length}`}
          >
            <Lightbulb size={13} />
            Hint {hintsRevealed}/{hints.length}
          </button>
        )}

        {/* Run */}
        <button
          onClick={() => runMutation.mutate()}
          disabled={!canRun || isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-card border border-dark-border text-gray-300 hover:text-white hover:bg-dark-hover text-xs rounded-lg transition-colors"
          title="Run (⌘+Enter)"
        >
          {runMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          Run
        </button>

        {/* QC */}
        <button
          onClick={() => activeProblem && qcMutation.mutate()}
          disabled={qcMutation.isPending || !activeProblem}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-card border border-dark-border text-gray-400 hover:text-blue-400 hover:border-blue-400/40 text-xs rounded-lg transition-colors disabled:opacity-40"
          title="Run QC audit — verify editorial solutions against all test cases"
        >
          {qcMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
          QC
        </button>

        {/* Submit */}
        <button
          onClick={() => submitMutation.mutate()}
          disabled={!canRun || isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-accent-fg font-semibold text-xs rounded-lg hover:opacity-90 transition-colors"
          title="Submit (⌘+Shift+Enter)"
        >
          {submitMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          Submit
        </button>
      </div>

      {/* Monaco Editor */}
      <div className="flex-1 overflow-hidden">
        <MonacoSQLEditor
          value={editorSQL}
          onChange={setEditorSQL}
          schema={activeProblem?.schema_sql || ''}
          language={isPython ? 'python' : 'sql'}
          onRun={() => canRun && !isLoading && runMutation.mutate()}
          onSubmit={() => canRun && !isLoading && submitMutation.mutate()}
        />
      </div>

      {/* Revealed hints */}
      {hintsOpen && hintsRevealed > 0 && (
        <div className="border-t border-dark-border bg-yellow-400/5 px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-yellow-400 flex items-center gap-1.5">
              <Lightbulb size={13} /> Hints
            </span>
            <button onClick={() => setHintsOpen(false)} className="text-xs text-gray-500 hover:text-gray-300">Hide</button>
          </div>
          {hints.slice(0, hintsRevealed).map((hint, i) => (
            <div key={i} className="text-xs text-gray-300 flex gap-2">
              <span className="text-yellow-400 font-medium shrink-0">#{i + 1}</span>
              <span>{hint}</span>
            </div>
          ))}
        </div>
      )}

      {/* Result panel */}
      <div className={`border-t border-dark-border shrink-0 ${resultOpen ? 'h-56' : 'h-10'} transition-all overflow-hidden`}>
        <div className="flex items-center gap-3 px-3 py-2 border-b border-dark-border bg-dark-panel">
          <div className="flex gap-1">
            {(['testcase', 'result'] as const).map(t => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`px-3 py-0.5 rounded text-xs font-medium capitalize transition-colors ${
                  activeTab === t ? 'text-accent bg-accent/10' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {t === 'testcase' ? 'Test Cases' : 'Result'}
              </button>
            ))}
          </div>
          {submitResult && (
            <div className={`flex items-center gap-1.5 text-xs font-medium ml-2 ${
              submitResult.status === 'accepted' ? 'text-success' : 'text-error'
            }`}>
              {submitResult.status === 'accepted'
                ? <><CheckCircle size={13} /> Accepted</>
                : <><XCircle size={13} /> {submitResult.status === 'error' ? 'Error' : 'Wrong Answer'} ({submitResult.test_cases_passed}/{submitResult.test_cases_total})</>
              }
            </div>
          )}
          <button
            onClick={() => setResultOpen(!resultOpen)}
            className="ml-auto text-gray-500 hover:text-gray-300"
          >
            {resultOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>

        {resultOpen && (
          <div className="overflow-y-auto h-[calc(100%-36px)] p-3">
            {activeTab === 'testcase' && activeProblem && (
              <div className="space-y-3">
                {submitResult?.status === 'accepted' ? (
                  <div className="text-xs text-gray-500 bg-dark-card border border-dark-border rounded-lg p-3">
                    This problem is accepted. Test-case mismatch details are hidden for solved problems.
                  </div>
                ) : (
                  <>
                {(submitResult?.test_case_details || []).map((tc, i) => (
                  <div key={i} className={`rounded-lg border text-xs overflow-hidden ${tc.passed ? 'border-success/30' : 'border-error/30'}`}>
                    {/* Header */}
                    <div className={`flex items-center gap-2 px-3 py-2 ${tc.passed ? 'bg-success/5' : 'bg-error/5'}`}>
                      {tc.passed ? <CheckCircle size={12} className="text-success" /> : <XCircle size={12} className="text-error" />}
                      <span className="font-medium text-gray-300">
                        {i === 0 ? 'Visible Test Case' : `Hidden Test Case ${i}`}
                      </span>
                      <span className="text-gray-600 ml-auto">{tc.execution_time_ms.toFixed(1)}ms</span>
                    </div>

                    {/* Failing case — show expected vs actual */}
                    {!tc.passed && (
                      <div className="p-3 space-y-3">
                        {tc.error ? (
                          <p className="text-error font-mono bg-error/10 rounded p-2 whitespace-pre-wrap text-[11px]">{tc.error}</p>
                        ) : isPython ? (
                          <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
                            <div>
                              <p className="text-gray-500 font-medium mb-1.5">Expected</p>
                              <pre className="bg-dark-input rounded p-2 text-gray-300 overflow-x-auto">{formatValue(getExpected(tc))}</pre>
                            </div>
                            <div>
                              <p className="text-gray-500 font-medium mb-1.5">Your Output</p>
                              <pre className="bg-dark-input rounded p-2 text-gray-300 overflow-x-auto">{formatValue(getActual(tc))}</pre>
                            </div>
                          </div>
                        ) : (() => {
                          const expected = asQueryResult(tc.expected)
                          const actual = asQueryResult(tc.actual)
                          return (
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <p className="text-gray-500 font-medium mb-1.5">Expected</p>
                              <div className="overflow-x-auto rounded border border-dark-border">
                                <table className="w-full font-mono text-[11px]">
                                  <thead>
                                    <tr className="bg-dark-input">
                                      {expected.columns.map((c: string) => (
                                        <th key={c} className="text-left px-2 py-1 text-gray-500 border-b border-dark-border whitespace-nowrap">{c}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {expected.rows.map((row, ri) => (
                                      <tr key={ri} className={ri % 2 === 0 ? 'bg-dark-bg/40' : ''}>
                                        {row.map((cell, ci) => (
                                          <td key={ci} className="px-2 py-1 text-gray-300 whitespace-nowrap">{String(cell ?? 'NULL')}</td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                            <div>
                              <p className="text-gray-500 font-medium mb-1.5">Your Output</p>
                              <div className="overflow-x-auto rounded border border-dark-border">
                                <table className="w-full font-mono text-[11px]">
                                  <thead>
                                    <tr className="bg-dark-input">
                                      {actual.columns.map((c: string) => (
                                        <th key={c} className="text-left px-2 py-1 text-gray-500 border-b border-dark-border whitespace-nowrap">{c}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {actual.rows.map((row, ri) => (
                                      <tr key={ri} className={ri % 2 === 0 ? 'bg-dark-bg/40' : ''}>
                                        {row.map((cell, ci) => (
                                          <td key={ci} className="px-2 py-1 text-gray-300 whitespace-nowrap">{String(cell ?? 'NULL')}</td>
                                        ))}
                                      </tr>
                                    ))}
                                    {actual.rows.length === 0 && (
                                      <tr><td colSpan={actual.columns.length || 1} className="px-2 py-2 text-gray-600 italic">empty result</td></tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                ))}
                {!submitResult && isPython && activeProblem.expected_output && (
                  <div className="text-xs text-gray-500">
                    <p className="mb-2 text-gray-400 font-medium">Sample test case:</p>
                    <pre className="font-mono bg-dark-card border border-dark-border rounded-lg p-3 text-gray-300 overflow-x-auto">
                      {JSON.stringify(activeProblem.expected_output as PythonExpectedOutput, null, 2)}
                    </pre>
                  </div>
                )}
                {!submitResult && !isPython && (activeProblem.expected_output as QueryResult)?.columns?.length > 0 && (
                  <div className="text-xs text-gray-500">
                    <p className="mb-2 text-gray-400 font-medium">Expected Output (sample):</p>
                    <ResultTable
                      columns={(activeProblem.expected_output as QueryResult).columns}
                      rows={(activeProblem.expected_output as QueryResult).rows}
                    />
                  </div>
                )}
                  </>
                )}
              </div>
            )}

            {activeTab === 'result' && runResult && (
              <div className="space-y-2">
                {runResult.error ? (
                  <div className="text-xs text-error bg-error/10 border border-error/20 rounded-lg p-3 font-mono whitespace-pre-wrap">
                    {runResult.error}
                  </div>
                ) : isPython && runResult.output !== undefined ? (
                  <>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                      <span className="text-success">Output</span>
                      <span>·</span>
                      <span>{runResult.execution_time_ms.toFixed(1)}ms</span>
                    </div>
                    <pre className="text-xs font-mono bg-dark-card border border-dark-border rounded-lg p-3 text-gray-300 overflow-x-auto">
                      {formatValue(runResult.output)}
                    </pre>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                      <span className="text-success">{runResult.row_count} rows</span>
                      <span>·</span>
                      <span>{runResult.execution_time_ms.toFixed(1)}ms</span>
                    </div>
                    <ResultTable columns={runResult.columns} rows={runResult.rows} />
                  </>
                )}
              </div>
            )}

            {activeTab === 'result' && submitResult && !runResult && (
              <div className="space-y-2">
                {submitResult.error_message ? (
                  <div className="text-xs text-error bg-error/10 border border-error/20 rounded-lg p-3 font-mono">
                    {submitResult.error_message}
                  </div>
                ) : submitResult.status !== 'accepted' ? (
                  <div className={`text-sm font-medium p-3 rounded-lg ${submitResult.all_passed ? 'text-success bg-success/10' : 'text-error bg-error/10'}`}>
                    {submitResult.all_passed ? '🎉 All test cases passed!' : `${submitResult.test_cases_passed}/${submitResult.test_cases_total} test cases passed`}
                  </div>
                ) : null}
              </div>
            )}

            {activeTab === 'result' && !runResult && !submitResult && (
              <p className="text-xs text-gray-600">{isPython ? 'Run your code to see output here.' : 'Run your query to see results here.'}</p>
            )}
          </div>
        )}
      </div>

      {/* QC Modal */}
      {qcOpen && qcResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-dark-panel border border-dark-border rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border shrink-0">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className={qcResult.overall_ok ? 'text-success' : 'text-error'} />
                <span className="font-semibold text-white text-sm">QC Audit — {qcResult.title}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${qcResult.overall_ok ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}`}>
                  {qcResult.overall_ok ? 'All Pass' : 'Issues Found'}
                </span>
              </div>
              <button onClick={() => setQcOpen(false)} className="text-gray-500 hover:text-gray-300 transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 p-4 space-y-5">
              {qcResult.approaches.map((approach) => (
                <div key={approach.approach_name} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-300">{approach.approach_name}</span>
                    <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${approach.all_passed ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}`}>
                      {approach.passed}/{approach.total} passed
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {approach.details.map((tc, i) => (
                      <div key={i} className={`rounded-lg border overflow-hidden ${tc.passed ? 'border-success/20' : 'border-error/30'}`}>
                        <div className={`flex items-center gap-2 px-3 py-2 text-xs ${tc.passed ? 'bg-success/5' : 'bg-error/5'}`}>
                          {tc.passed
                            ? <CheckCircle size={12} className="text-success shrink-0" />
                            : <XCircle size={12} className="text-error shrink-0" />}
                          <span className="text-gray-300 font-medium">{tc.description}</span>
                          <span className="ml-auto text-gray-600">{tc.execution_time_ms.toFixed(1)}ms</span>
                        </div>
                        {!tc.passed && (
                          <div className="px-3 pb-3 pt-2 space-y-2">
                            {tc.error ? (
                              <p className="text-xs text-error font-mono bg-error/10 rounded p-2 break-all">{tc.error}</p>
                            ) : isPython ? (
                              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                                <pre className="bg-dark-input rounded p-2 text-gray-300 overflow-x-auto">{formatValue(getExpected(tc))}</pre>
                                <pre className="bg-dark-input rounded p-2 text-gray-300 overflow-x-auto">{formatValue(getActual(tc))}</pre>
                              </div>
                            ) : (() => {
                              const expected = asQueryResult(tc.expected)
                              const actual = asQueryResult(tc.actual)
                              return (
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <p className="text-[10px] text-gray-500 font-medium mb-1">Expected</p>
                                  <div className="overflow-x-auto rounded border border-dark-border">
                                    <table className="w-full font-mono text-[10px]">
                                      <thead>
                                        <tr className="bg-dark-input">
                                          {expected.columns.map((c: string) => <th key={c} className="text-left px-2 py-1 text-gray-500 border-b border-dark-border whitespace-nowrap">{c}</th>)}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {expected.rows.map((row, ri) => (
                                          <tr key={ri} className={ri % 2 === 0 ? 'bg-dark-bg/40' : ''}>
                                            {row.map((cell, ci) => <td key={ci} className="px-2 py-1 text-gray-300 whitespace-nowrap">{String(cell ?? 'NULL')}</td>)}
                                          </tr>
                                        ))}
                                        {expected.rows.length === 0 && (
                                          <tr><td className="px-2 py-1 text-gray-600 italic">empty</td></tr>
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                                <div>
                                  <p className="text-[10px] text-gray-500 font-medium mb-1">Got</p>
                                  <div className="overflow-x-auto rounded border border-dark-border">
                                    <table className="w-full font-mono text-[10px]">
                                      <thead>
                                        <tr className="bg-dark-input">
                                          {actual.columns.map((c: string) => <th key={c} className="text-left px-2 py-1 text-gray-500 border-b border-dark-border whitespace-nowrap">{c}</th>)}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {actual.rows.map((row, ri) => (
                                          <tr key={ri} className={ri % 2 === 0 ? 'bg-dark-bg/40' : ''}>
                                            {row.map((cell, ci) => <td key={ci} className="px-2 py-1 text-gray-300 whitespace-nowrap">{String(cell ?? 'NULL')}</td>)}
                                          </tr>
                                        ))}
                                        {actual.rows.length === 0 && (
                                          <tr><td className="px-2 py-1 text-gray-600 italic">empty</td></tr>
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </div>
                              )
                            })()}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
