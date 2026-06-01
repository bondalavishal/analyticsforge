import { useState } from 'react'
import { ArrowUpDown } from 'lucide-react'

interface Props {
  columns: string[]
  rows: (string | number | null)[][]
  maxRows?: number
}

export default function ResultTable({ columns, rows, maxRows = 100 }: Props) {
  const [sortCol, setSortCol] = useState<number | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  if (!columns.length) return null

  const handleSort = (i: number) => {
    if (sortCol === i) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(i)
      setSortDir('asc')
    }
  }

  const displayRows = sortCol !== null
    ? [...rows].sort((a, b) => {
        const av = a[sortCol] ?? ''
        const bv = b[sortCol] ?? ''
        const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
        return sortDir === 'asc' ? cmp : -cmp
      })
    : rows

  const visibleRows = displayRows.slice(0, maxRows)

  return (
    <div className="overflow-x-auto rounded-lg border border-dark-border">
      <table className="min-w-full text-xs font-mono">
        <thead>
          <tr className="bg-dark-card">
            {columns.map((col, i) => (
              <th
                key={i}
                onClick={() => handleSort(i)}
                className="px-3 py-2 text-left text-gray-400 font-medium border-b border-dark-border cursor-pointer hover:text-gray-200 select-none whitespace-nowrap"
              >
                <span className="flex items-center gap-1">
                  {col}
                  <ArrowUpDown size={10} className={sortCol === i ? 'text-primary' : 'text-gray-600'} />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-dark-input' : 'bg-dark-panel'}>
              {row.map((v, j) => (
                <td key={j} className="px-3 py-1.5 text-gray-300 whitespace-nowrap max-w-[200px] truncate">
                  {v === null ? <span className="text-gray-600 italic">NULL</span> : String(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > maxRows && (
        <div className="px-3 py-1.5 text-xs text-gray-500 border-t border-dark-border text-center">
          Showing {maxRows} of {rows.length} rows
        </div>
      )}
    </div>
  )
}
