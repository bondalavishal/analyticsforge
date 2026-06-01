import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bookmark, BookmarkCheck, Flag, Download, ChevronDown, ChevronRight, Lock, XCircle, CheckCircle } from 'lucide-react'
import { problemsApi, submissionsApi, exportApi } from '@/utils/api'
import { useAppStore } from '@/store'
import toast from 'react-hot-toast'
import type { Problem, PythonExpectedOutput } from '@/types'
import { trackLabel } from '@/utils/language'

const TABS = ['Description', 'Editorial', 'Submissions', 'Notes'] as const
type Tab = typeof TABS[number]

const diffColors: Record<string, string> = {
  easy: 'text-success bg-success/10',
  medium: 'text-yellow-400 bg-yellow-400/10',
  hard: 'text-error bg-error/10',
}

const SQL_KEYWORD_RULES: Array<[RegExp, string]> = [
  [/\bgroup\s+by\b/gi, 'GROUP BY'],
  [/\border\s+by\b/gi, 'ORDER BY'],
  [/\bpartition\s+by\b/gi, 'PARTITION BY'],
  [/\bunion\s+all\b/gi, 'UNION ALL'],
  [/\bleft\s+join\b/gi, 'LEFT JOIN'],
  [/\bright\s+join\b/gi, 'RIGHT JOIN'],
  [/\binner\s+join\b/gi, 'INNER JOIN'],
  [/\bfull\s+join\b/gi, 'FULL JOIN'],
  [/\bcross\s+join\b/gi, 'CROSS JOIN'],
  [/\bselect\b/gi, 'SELECT'],
  [/\bfrom\b/gi, 'FROM'],
  [/\bwhere\b/gi, 'WHERE'],
  [/\bhaving\b/gi, 'HAVING'],
  [/\blimit\b/gi, 'LIMIT'],
  [/\boffset\b/gi, 'OFFSET'],
  [/\bwindow\b/gi, 'WINDOW'],
  [/\bjoin\b/gi, 'JOIN'],
  [/\bon\b/gi, 'ON'],
  [/\band\b/gi, 'AND'],
  [/\bor\b/gi, 'OR'],
  [/\bcase\b/gi, 'CASE'],
  [/\bwhen\b/gi, 'WHEN'],
  [/\bthen\b/gi, 'THEN'],
  [/\belse\b/gi, 'ELSE'],
  [/\bend\b/gi, 'END'],
  [/\bas\b/gi, 'AS'],
  [/\bover\b/gi, 'OVER'],
]

function formatSQLForDisplay(sql: string): string {
  if (!sql?.trim()) return ''

  let formatted = sql
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()

  for (const [pattern, keyword] of SQL_KEYWORD_RULES) {
    formatted = formatted.replace(pattern, keyword)
  }

  formatted = formatted
    .replace(/\s+(FROM|WHERE|GROUP BY|HAVING|ORDER BY|LIMIT|OFFSET|WINDOW|UNION ALL|UNION|INTERSECT|EXCEPT)\b/g, '\n$1')
    .replace(/\s+(LEFT JOIN|RIGHT JOIN|INNER JOIN|FULL JOIN|CROSS JOIN|JOIN)\b/g, '\n$1')
    .replace(/\s+ON\b/g, '\n  ON')
    .replace(/\s+(AND|OR)\b/g, '\n  $1')
    .replace(/SELECT\s+/g, 'SELECT\n  ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return formatted
}

interface ParsedColumn { name: string; type: string; pk: boolean }
interface ParsedTable  { name: string; columns: ParsedColumn[] }

function parseSchema(sql: string): ParsedTable[] {
  const tables: ParsedTable[] = []
  const tableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(([^)]+(?:\([^)]*\)[^)]*)*)\)/gi
  let m: RegExpExecArray | null
  while ((m = tableRe.exec(sql)) !== null) {
    const name = m[1]
    const body = m[2]
    const columns: ParsedColumn[] = []
    for (const raw of body.split(',')) {
      const line = raw.trim()
      if (!line || /^(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|INDEX|CONSTRAINT)/i.test(line)) continue
      const col = line.match(/^(\w+)\s+([\w]+(?:\s*\(\d+(?:,\s*\d+)?\))?)(.*)/)
      if (col) {
        columns.push({
          name: col[1],
          type: col[2].toUpperCase(),
          pk: /PRIMARY\s+KEY/i.test(col[3] || ''),
        })
      }
    }
    if (columns.length) tables.push({ name, columns })
  }
  return tables
}

function SchemaBlock({ sql }: { sql: string }) {
  const tables = parseSchema(sql)
  if (!tables.length) {
    return (
      <pre className="bg-dark-input rounded-xl p-3 text-xs font-mono text-gray-300 border border-dark-border whitespace-pre-wrap break-all">
        {sql}
      </pre>
    )
  }
  return (
    <div className="space-y-3">
      {tables.map(t => (
        <div key={t.name} className="border border-dark-border rounded-xl overflow-hidden">
          <div className="px-3 py-2 bg-dark-card border-b border-dark-border flex items-center gap-2">
            <span className="text-xs text-gray-500">Table:</span>
            <code className="text-xs font-mono font-semibold text-primary">{t.name}</code>
          </div>
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="bg-dark-input text-gray-500">
                <th className="text-left px-3 py-1.5 font-medium border-b border-dark-border w-1/2">Column Name</th>
                <th className="text-left px-3 py-1.5 font-medium border-b border-dark-border">Type</th>
              </tr>
            </thead>
            <tbody>
              {t.columns.map((c, i) => (
                <tr key={c.name} className={i % 2 === 0 ? 'bg-dark-bg/40' : ''}>
                  <td className="px-3 py-1.5 text-gray-200 flex items-center gap-1.5">
                    {c.name}
                    {c.pk && <span className="text-[9px] text-primary border border-primary/40 rounded px-1 py-0 leading-4">PK</span>}
                  </td>
                  <td className="px-3 py-1.5 text-gray-400">{c.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

interface SampleTable { name: string; columns: string[]; rows: string[][] }

function parseSampleData(sql: string, schemaColumns: Record<string, string[]> = {}): SampleTable[] {
  const tables: Record<string, SampleTable> = {}
  // Match both explicit: INSERT INTO t (col1, col2) VALUES (...) and positional: INSERT INTO t VALUES (...)
  const insertRe = /INSERT\s+INTO\s+(\w+)(?:\s*\(([^)]+)\))?\s*VALUES\s*([\s\S]+?)(?=INSERT\s+INTO|$)/gi
  let m: RegExpExecArray | null
  while ((m = insertRe.exec(sql)) !== null) {
    const name = m[1]
    const cols = m[2]
      ? m[2].split(',').map(c => c.trim())
      : (schemaColumns[name] || [])
    const valuesPart = m[3].replace(/;\s*$/, '').trim()
    // Extract each row tuple
    const rowRe = /\(([^)]+)\)/g
    let rm: RegExpExecArray | null
    const rows: string[][] = []
    while ((rm = rowRe.exec(valuesPart)) !== null) {
      const cells = rm[1].split(',').map(v => v.trim().replace(/^'(.*)'$/, '$1'))
      rows.push(cells)
    }
    if (!tables[name]) tables[name] = { name, columns: cols, rows: [] }
    tables[name].rows.push(...rows)
  }
  return Object.values(tables)
}

function SampleDataBlock({ sql, schema }: { sql: string; schema?: string }) {
  const schemaColumns: Record<string, string[]> = {}
  if (schema) {
    parseSchema(schema).forEach(t => { schemaColumns[t.name] = t.columns.map(c => c.name) })
  }
  const tables = parseSampleData(sql, schemaColumns)
  if (!tables.length) {
    return (
      <pre className="bg-dark-input rounded-xl p-3 text-xs font-mono text-gray-300 border border-dark-border whitespace-pre-wrap break-all">
        {sql}
      </pre>
    )
  }
  return (
    <div className="space-y-3">
      {tables.map(t => (
        <div key={t.name} className="border border-dark-border rounded-xl overflow-hidden">
          <div className="px-3 py-2 bg-dark-card border-b border-dark-border flex items-center gap-2">
            <span className="text-xs text-gray-500">Table:</span>
            <code className="text-xs font-mono font-semibold text-primary">{t.name}</code>
            <span className="text-xs text-gray-600 ml-auto">{t.rows.length} rows</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="bg-dark-input text-gray-500">
                  {t.columns.map(c => (
                    <th key={c} className="text-left px-3 py-1.5 font-medium border-b border-dark-border whitespace-nowrap">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.rows.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-dark-bg/40' : ''}>
                    {row.map((cell, j) => (
                      <td key={j} className="px-3 py-1.5 text-gray-300 whitespace-nowrap max-w-[160px] truncate" title={cell}>
                        {cell === 'NULL' ? <span className="text-gray-600">NULL</span> : cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

function ResultTable({ columns, rows }: { columns: string[]; rows: (string|number|null)[][] }) {
  if (!columns.length) return null
  return (
    <div className="overflow-x-auto rounded-lg border border-dark-border text-xs font-mono">
      <table className="min-w-full">
        <thead>
          <tr className="bg-dark-card">
            {columns.map(c => <th key={c} className="px-3 py-2 text-left text-gray-400 font-medium border-b border-dark-border">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-dark-input' : 'bg-dark-panel'}>
              {row.map((v, j) => <td key={j} className="px-3 py-1.5 text-gray-300">{v === null ? <span className="text-gray-600">NULL</span> : String(v)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PythonExample({ expectedOutput, functionName }: { expectedOutput: PythonExpectedOutput; functionName?: string }) {
  const inputs = expectedOutput.inputs || {}
  const args = Object.entries(inputs).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(', ')

  return (
    <div className="space-y-2 text-xs font-mono">
      <div className="bg-dark-input rounded-xl p-3 border border-dark-border">
        <p className="text-gray-500 mb-1">Function call</p>
        <code className="text-gray-300">{functionName || 'solve'}({args})</code>
      </div>
      <div className="bg-dark-input rounded-xl p-3 border border-dark-border">
        <p className="text-gray-500 mb-1">Returns</p>
        <pre className="text-gray-300 whitespace-pre-wrap">{JSON.stringify(expectedOutput.expected, null, 2)}</pre>
      </div>
      {expectedOutput.compare_unordered && (
        <p className="text-gray-500">Order does not matter for this expected result.</p>
      )}
    </div>
  )
}

function ApproachCard({ approach, index, isPython }: { approach: any; index: number; isPython?: boolean }) {
  const [expanded, setExpanded] = useState(index === 0)
  const code = isPython ? (approach.solution_python || approach.solution_sql || '') : (approach.solution_sql || '')
  const formattedSQL = isPython ? code : formatSQLForDisplay(code)

  return (
    <div className="border border-dark-border rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-dark-card hover:bg-dark-hover transition-colors"
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="font-medium text-sm text-gray-200">Approach {index + 1}: {approach.approach_name}</span>
        </div>
        <div className="flex gap-2">
          <span className="tag text-xs">{approach.time_complexity}</span>
          <span className="tag text-xs">{approach.space_complexity}</span>
        </div>
      </button>
      {expanded && (
        <div className="p-4 space-y-3">
          <p className="text-sm text-gray-400 leading-relaxed">{approach.explanation}</p>
          <pre className="bg-dark-input rounded-xl p-3 text-xs font-mono text-gray-300 border border-dark-border whitespace-pre-wrap break-words leading-relaxed">
            <code className={isPython ? 'language-python' : 'language-sql'}>{formattedSQL}</code>
          </pre>
        </div>
      )}
    </div>
  )
}

export default function ProblemDescription({ problem }: { problem: Problem }) {
  const [tab, setTab] = useState<Tab>('Description')
  const isPython = problem.language === 'python'
  const [notes, setNotes] = useState(problem.personal_notes || '')
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [flagReason, setFlagReason] = useState('')
  const [showFlag, setShowFlag] = useState(false)
  const { activeProfile, lastSubmitResult } = useAppStore()
  const qc = useQueryClient()

  useEffect(() => {
    setNotes(problem.personal_notes || '')
    return () => {
      if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
    }
  }, [problem.id])

  const { data: submissions = [] } = useQuery({
    queryKey: ['submissions', problem.id, activeProfile?.id],
    queryFn: () => submissionsApi.list({ problem_id: problem.id, profile_id: activeProfile?.id }),
    enabled: tab === 'Submissions' && !!activeProfile,
  })

  const bookmarkMutation = useMutation({
    mutationFn: () => problemsApi.bookmark(problem.id, activeProfile!.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['problems'] }),
  })

  const flagMutation = useMutation({
    mutationFn: () => problemsApi.flag(problem.id, activeProfile!.id, flagReason),
    onSuccess: () => { toast.success('Problem flagged for review'); setShowFlag(false) },
  })

  const exportMD = async () => {
    const blob = await exportApi.markdown(problem.id, activeProfile?.id)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${problem.problem_number}_${problem.title.replace(/\s+/g, '_')}.md`
    a.click(); URL.revokeObjectURL(url)
  }

  const exportPDF = async () => {
    try {
      const blob = await exportApi.pdf(problem.id, activeProfile?.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${problem.problem_number}_${problem.title.replace(/\s+/g, '_')}.pdf`
      a.click(); URL.revokeObjectURL(url)
    } catch { toast.error('PDF export failed') }
  }

  const autoSaveNotes = (value: string) => {
    setNotes(value)
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
    notesTimerRef.current = setTimeout(() => {
      if (activeProfile) problemsApi.saveNotes(problem.id, activeProfile.id, value)
    }, 1000)
  }

  const isSolved = problem.user_status === 'solved'
  const statusColors: Record<string, string> = {
    accepted: 'text-success', wrong_answer: 'text-error', error: 'text-yellow-400'
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-dark-border px-1 shrink-0">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
              tab === t ? 'text-primary border-primary' : 'text-gray-400 border-transparent hover:text-gray-200'
            }`}
          >
            {t}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1 px-2">
          <button onClick={() => bookmarkMutation.mutate()} className="p-1.5 rounded hover:bg-dark-hover transition-colors" title="Bookmark">
            {problem.is_bookmarked
              ? <BookmarkCheck size={15} className="text-primary" fill="currentColor" />
              : <Bookmark size={15} className="text-gray-500" />
            }
          </button>
          <button onClick={() => setShowFlag(!showFlag)} className="p-1.5 rounded hover:bg-dark-hover transition-colors text-gray-500 hover:text-yellow-400" title="Flag problem">
            <Flag size={15} />
          </button>
          <div className="relative group">
            <button className="p-1.5 rounded hover:bg-dark-hover transition-colors text-gray-500 hover:text-gray-300" title="Export">
              <Download size={15} />
            </button>
            <div className="absolute right-0 top-8 hidden group-hover:flex flex-col bg-dark-panel border border-dark-border rounded-lg shadow-xl z-10 min-w-[110px]">
              <button onClick={exportMD} className="px-3 py-2 text-xs text-gray-300 hover:bg-dark-hover text-left">Markdown</button>
              <button onClick={exportPDF} className="px-3 py-2 text-xs text-gray-300 hover:bg-dark-hover text-left">PDF</button>
            </div>
          </div>
        </div>
      </div>

      {/* Flag form */}
      {showFlag && (
        <div className="mx-4 mt-3 p-3 bg-yellow-400/5 border border-yellow-400/20 rounded-xl space-y-2">
          <p className="text-xs text-yellow-400 font-medium">Flag this problem for review / regeneration</p>
          <input className="input text-xs" placeholder="Reason (e.g. wrong expected output)" value={flagReason} onChange={e => setFlagReason(e.target.value)} />
          <div className="flex gap-2">
            <button onClick={() => flagMutation.mutate()} className="text-xs bg-yellow-400/10 text-yellow-400 px-3 py-1.5 rounded-lg hover:bg-yellow-400/20">Submit Flag</button>
            <button onClick={() => setShowFlag(false)} className="text-xs text-gray-500 hover:text-gray-300">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {/* Description */}
        {tab === 'Description' && (
          <div className="space-y-5 max-w-2xl">
            <div>
              <div className="flex items-start gap-3 flex-wrap mb-3">
                <h1 className="text-lg font-semibold text-white">{problem.problem_number}. {problem.title}</h1>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded capitalize font-medium ${diffColors[problem.difficulty]}`}>
                  {problem.difficulty}
                </span>
                <span className="tag uppercase text-xs">{isPython ? trackLabel('python') : problem.dialect}</span>
                {problem.topic_tags.map(tag => <span key={tag} className="tag">{tag}</span>)}
              </div>
            </div>

            <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
              {problem.description}
            </div>

            {!isPython && (
            <>
            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-2">Schema</h3>
              <SchemaBlock sql={problem.schema_sql} />
            </div>

            <details className="group">
              <summary className="cursor-pointer text-sm text-gray-400 hover:text-gray-200 flex items-center gap-1 select-none">
                <ChevronRight size={14} className="group-open:rotate-90 transition-transform" />
                Sample Data
              </summary>
              <div className="mt-2"><SampleDataBlock sql={problem.sample_data_sql} schema={problem.schema_sql} /></div>
            </details>

            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-2">Example Output</h3>
              <ResultTable
                columns={(problem.expected_output as { columns?: string[] })?.columns || []}
                rows={(problem.expected_output as { rows?: (string|number|null)[][] })?.rows || []}
              />
            </div>
            </>
            )}

            {isPython && (
            <>
            {problem.starter_code && (
              <div>
                <h3 className="text-sm font-semibold text-gray-300 mb-2">Starter Code</h3>
                <pre className="bg-dark-input rounded-xl p-3 text-xs font-mono text-gray-300 border border-dark-border whitespace-pre-wrap">{problem.starter_code}</pre>
              </div>
            )}
            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-2">Example</h3>
              <PythonExample expectedOutput={problem.expected_output as PythonExpectedOutput} functionName={problem.function_name} />
            </div>
            </>
            )}
          </div>
        )}

        {/* Editorial */}
        {tab === 'Editorial' && (
          <div className="max-w-2xl space-y-4">
            {!isSolved && (
              <div className="flex items-center gap-3 bg-dark-card border border-dark-border rounded-xl p-4">
                <Lock size={20} className="text-gray-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-300">Solve the problem to unlock the editorial</p>
                  <p className="text-xs text-gray-500 mt-0.5">Submit a correct solution first</p>
                </div>
              </div>
            )}
            {isSolved && problem.editorial?.map((approach, i) => (
              <ApproachCard key={i} approach={approach} index={i} isPython={isPython} />
            ))}
            {(!problem.editorial || problem.editorial.length === 0) && (
              <p className="text-gray-500 text-sm">No editorial available for this problem.</p>
            )}

            {/* Failed test cases from last submission */}
            {isSolved && lastSubmitResult && !lastSubmitResult.all_passed && lastSubmitResult.test_case_details?.some(tc => !tc.passed) && (
              <div className="space-y-3 mt-2">
                <h3 className="text-sm font-semibold text-gray-300">Failed Test Cases</h3>
                <p className="text-xs text-gray-500">These cases weren't covered by your last submission. Study the expected outputs to refine your solution.</p>
                {lastSubmitResult.test_case_details.filter(tc => !tc.passed).map((tc, i) => (
                  <div key={i} className="border border-error/30 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-error/5">
                      <XCircle size={12} className="text-error" />
                      <span className="text-xs font-medium text-gray-300">
                        {tc.test_case_index === 0 ? 'Visible Test Case' : `Hidden Test Case ${tc.test_case_index}`}
                      </span>
                    </div>
                    <div className="p-3">
                      {tc.error ? (
                        <p className="text-xs text-error font-mono bg-error/10 rounded p-2">{tc.error}</p>
                      ) : isPython ? (
                        <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
                          <div>
                            <p className="text-xs text-gray-500 font-medium mb-1.5">Expected</p>
                            <pre className="bg-dark-input rounded p-2 text-gray-300 overflow-x-auto">{JSON.stringify((tc.expected as { value?: unknown }).value, null, 2)}</pre>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 font-medium mb-1.5">Got</p>
                            <pre className="bg-dark-input rounded p-2 text-gray-300 overflow-x-auto">{JSON.stringify((tc.actual as { value?: unknown }).value, null, 2)}</pre>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-xs text-gray-500 font-medium mb-1.5 flex items-center gap-1"><CheckCircle size={11} className="text-success" /> Expected</p>
                            <div className="overflow-x-auto rounded border border-dark-border">
                              <table className="w-full font-mono text-[11px]">
                                <thead>
                                  <tr className="bg-dark-input">
                                    {((tc.expected as { columns: string[] }).columns || []).map((c: string) => <th key={c} className="text-left px-2 py-1 text-gray-500 border-b border-dark-border whitespace-nowrap">{c}</th>)}
                                  </tr>
                                </thead>
                                <tbody>
                                  {((tc.expected as { rows: (string|number|null)[][] }).rows || []).map((row, ri) => (
                                    <tr key={ri} className={ri % 2 === 0 ? 'bg-dark-bg/40' : ''}>
                                      {row.map((cell, ci) => <td key={ci} className="px-2 py-1 text-gray-300 whitespace-nowrap">{String(cell ?? 'NULL')}</td>)}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 font-medium mb-1.5 flex items-center gap-1"><XCircle size={11} className="text-error" /> Your Output</p>
                            <div className="overflow-x-auto rounded border border-dark-border">
                              <table className="w-full font-mono text-[11px]">
                                <thead>
                                  <tr className="bg-dark-input">
                                    {((tc.actual as { columns: string[] }).columns || []).map((c: string) => <th key={c} className="text-left px-2 py-1 text-gray-500 border-b border-dark-border whitespace-nowrap">{c}</th>)}
                                  </tr>
                                </thead>
                                <tbody>
                                  {((tc.actual as { rows: (string|number|null)[][] }).rows || []).map((row, ri) => (
                                    <tr key={ri} className={ri % 2 === 0 ? 'bg-dark-bg/40' : ''}>
                                      {row.map((cell, ci) => <td key={ci} className="px-2 py-1 text-gray-300 whitespace-nowrap">{String(cell ?? 'NULL')}</td>)}
                                    </tr>
                                  ))}
                                  {((tc.actual as { rows: (string|number|null)[][] }).rows || []).length === 0 && (
                                    <tr><td colSpan={((tc.actual as { columns: string[] }).columns || []).length || 1} className="px-2 py-2 text-gray-600 italic">empty result</td></tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Submissions */}
        {tab === 'Submissions' && (
          <div className="max-w-2xl space-y-2">
            {submissions.length === 0 ? (
              <p className="text-gray-500 text-sm">No submissions yet.</p>
            ) : (
              submissions.map(sub => (
                <details key={sub.id} className="group bg-dark-card rounded-xl border border-dark-border overflow-hidden">
                  <summary className="cursor-pointer px-4 py-3 flex items-center gap-3 hover:bg-dark-hover select-none">
                    <span className={`text-sm font-medium capitalize ${statusColors[sub.status] || 'text-gray-400'}`}>
                      {sub.status.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-gray-500">{sub.test_cases_passed}/{sub.test_cases_total} tests</span>
                    <span className="text-xs text-gray-500">{sub.execution_time_ms.toFixed(0)}ms</span>
                    <span className="text-xs text-gray-600 ml-auto">{new Date(sub.submitted_at).toLocaleDateString()}</span>
                  </summary>
                  <div className="px-4 pb-3">
                    <pre className="bg-dark-input rounded-lg p-3 text-xs font-mono text-gray-300 border border-dark-border whitespace-pre-wrap break-words leading-relaxed">
                      <code className={isPython ? 'language-python' : 'language-sql'}>
                        {isPython ? sub.submitted_sql : formatSQLForDisplay(sub.submitted_sql)}
                      </code>
                    </pre>
                  </div>
                </details>
              ))
            )}
          </div>
        )}

        {/* Notes */}
        {tab === 'Notes' && (
          <div className="max-w-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-300">Personal Notes</h3>
              <span className="text-xs text-gray-600">{notes.length} chars — auto-saved</span>
            </div>
            <textarea
              className="input resize-none min-h-[300px] font-mono text-sm leading-relaxed"
              placeholder="Jot down your approach, key insights, things to remember..."
              value={notes}
              onChange={e => autoSaveNotes(e.target.value)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
