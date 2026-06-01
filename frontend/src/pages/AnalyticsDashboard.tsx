import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { Flame, Target, Clock, TrendingUp, Loader2 } from 'lucide-react'
import { analyticsApi } from '@/utils/api'
import { useAppStore } from '@/store'

const PERIODS = [
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'All Time', value: 'all' },
]

const DIFF_COLORS = { easy: '#00B8A3', medium: '#FFC01E', hard: '#FF375F' }

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-dark-panel border border-dark-border rounded-xl p-4 flex items-start gap-3">
      <div className="p-2 bg-primary/10 rounded-lg shrink-0">{icon}</div>
      <div>
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-white mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function SubmissionHeatmap({ data, isDark }: { data: Record<string, number>; isDark: boolean }) {
  const today = new Date()
  const weeks: { date: Date; count: number }[][] = []
  const start = new Date(today)
  start.setDate(start.getDate() - 364)
  start.setDate(start.getDate() - start.getDay()) // Sunday

  let week: { date: Date; count: number }[] = []
  const cur = new Date(start)

  while (cur <= today) {
    const key = cur.toISOString().split('T')[0]
    week.push({ date: new Date(cur), count: data[key] || 0 })
    if (week.length === 7) { weeks.push(week); week = [] }
    cur.setDate(cur.getDate() + 1)
  }
  if (week.length) weeks.push(week)

  const maxCount = Math.max(...Object.values(data), 1)
  const getColor = (count: number) => {
    if (!count) return isDark ? '#2D2D2D' : '#E5E7EB'
    const intensity = Math.min(count / maxCount, 1)
    if (intensity < 0.25) return '#854d0e'
    if (intensity < 0.5) return '#a16207'
    if (intensity < 0.75) return '#ca8a04'
    return '#FFA116'
  }

  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-0.5">
        <div className="flex flex-col gap-0.5 mr-1">
          {DAYS.map((d, i) => (
            <div key={d} style={{ height: 11, fontSize: 9, lineHeight: '11px' }} className="text-gray-600 text-right w-6">
              {i % 2 === 1 ? d : ''}
            </div>
          ))}
        </div>
        <div className="flex gap-0.5">
          {weeks.map((w, wi) => (
            <div key={wi} className="flex flex-col gap-0.5">
              {w.map((day, di) => (
                <div
                  key={di}
                  className="w-2.5 h-2.5 rounded-sm cursor-pointer group relative"
                  style={{ background: getColor(day.count) }}
                  title={`${day.date.toDateString()}: ${day.count} submissions`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
        <span>Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map(i => (
          <div key={i} className="w-2.5 h-2.5 rounded-sm" style={{ background: getColor(i * maxCount) }} />
        ))}
        <span>More</span>
      </div>
    </div>
  )
}

export default function AnalyticsDashboard() {
  const { activeProfile, theme, practiceLanguage } = useAppStore()
  const isDark = theme === 'dark'
  const [period, setPeriod] = useState('all')

  const chartTooltipStyle = isDark
    ? { background: '#282828', border: '1px solid #3D3D3D', borderRadius: 8, fontSize: 12 }
    : { background: '#ffffff', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 12, color: '#111827' }
  const axisTickColor = isDark ? '#6B7280' : '#9CA3AF'
  const axisTickColorAlt = isDark ? '#9CA3AF' : '#6B7280'
  const gridStroke = isDark ? '#3D3D3D' : '#E5E7EB'

  const { data, isLoading } = useQuery({
    queryKey: ['analytics', activeProfile?.id, period, practiceLanguage],
    queryFn: () => analyticsApi.dashboard(activeProfile!.id, period, practiceLanguage),
    enabled: !!activeProfile,
  })

  if (!activeProfile) return <div className="flex items-center justify-center h-full text-gray-500">Select a profile first</div>

  if (isLoading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 size={24} className="animate-spin text-primary" />
    </div>
  )

  if (!data) return null

  const pieData = [
    { name: 'Easy', value: data.problems_by_difficulty.easy, color: DIFF_COLORS.easy },
    { name: 'Medium', value: data.problems_by_difficulty.medium, color: DIFF_COLORS.medium },
    { name: 'Hard', value: data.problems_by_difficulty.hard, color: DIFF_COLORS.hard },
  ].filter(d => d.value > 0)

  const topicBarData = Object.entries(data.accuracy_by_topic)
    .map(([topic, rate]) => ({ topic: topic.split(' ')[0], rate }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 8)

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <span className="text-xs uppercase tracking-wide text-gray-500 font-medium">{practiceLanguage === 'python' ? 'Python track' : 'SQL track'}</span>
          <div className="flex gap-1 bg-dark-panel border border-dark-border rounded-xl p-1">
            {PERIODS.map(p => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  period === p.value ? 'bg-primary text-black font-medium' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={<Target size={18} className="text-primary" />} label="Total Solved" value={data.total_solved} sub={`${data.acceptance_rate}% acceptance`} />
          <StatCard icon={<Flame size={18} className="text-orange-400" />} label="Current Streak" value={`${data.streak_info.current_streak}d`} sub={`Best: ${data.streak_info.longest_streak} days`} />
          <StatCard icon={<TrendingUp size={18} className="text-success" />} label="Accuracy Rate" value={`${data.acceptance_rate}%`} sub={`${data.total_submissions} submissions`} />
          <StatCard icon={<Clock size={18} className="text-blue-400" />} label="Avg. Solve Time" value={`${data.avg_time_to_solve_minutes}m`} sub="per problem" />
        </div>

        {/* Heatmap */}
        <div className="bg-dark-panel border border-dark-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Submission Activity</h2>
          <SubmissionHeatmap data={data.submission_heatmap} isDark={isDark} />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Pie chart */}
          <div className="bg-dark-panel border border-dark-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-300 mb-4">Problems by Difficulty</h2>
            {pieData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={48} outerRadius={72} dataKey="value" paddingAngle={3}>
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number, name: string) => [v, name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex items-center justify-center gap-4 mt-3">
                  {pieData.map(d => (
                    <div key={d.name} className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                      <span className="text-xs" style={{ color: axisTickColorAlt }}>{d.name} ({d.value})</span>
                    </div>
                  ))}
                </div>
              </>
            ) : <p className="text-gray-500 text-sm text-center py-8">No data yet</p>}
          </div>

          {/* Topic accuracy */}
          <div className="bg-dark-panel border border-dark-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-300 mb-4">Accuracy by Topic</h2>
            {topicBarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={topicBarData} layout="vertical" margin={{ left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: axisTickColor }} unit="%" />
                  <YAxis type="category" dataKey="topic" tick={{ fontSize: 10, fill: axisTickColorAlt }} width={70} />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    formatter={(v: number) => [`${v}%`, 'Accuracy']}
                  />
                  <Bar dataKey="rate" fill="#FFA116" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-gray-500 text-sm text-center py-8">No topic data yet</p>}
          </div>
        </div>

        {/* Improvement over time */}
        {data.improvement_over_time.length > 0 && (
          <div className="bg-dark-panel border border-dark-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-300 mb-4">Problems Solved Over Time</h2>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={data.improvement_over_time}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: axisTickColor }} />
                <YAxis tick={{ fontSize: 10, fill: axisTickColor }} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Line type="monotone" dataKey="solved" stroke="#FFA116" strokeWidth={2} dot={{ fill: '#FFA116', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Weak & strong topics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-dark-panel border border-dark-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-error mb-3">📉 Weak Areas</h2>
            {data.weak_topics.length === 0
              ? <p className="text-gray-500 text-sm">No weak areas identified yet. Keep practicing!</p>
              : data.weak_topics.map(t => (
                <div key={t.topic} className="mb-2">
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="text-gray-300">{t.topic}</span>
                    <span className="text-error">{t.rate}% failure</span>
                  </div>
                  <div className="h-1.5 bg-dark-border rounded-full overflow-hidden">
                    <div className="h-full bg-error rounded-full" style={{ width: `${t.rate}%` }} />
                  </div>
                </div>
              ))
            }
          </div>
          <div className="bg-dark-panel border border-dark-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-success mb-3">📈 Strong Areas</h2>
            {data.strong_topics.length === 0
              ? <p className="text-gray-500 text-sm">Solve more problems to see your strengths.</p>
              : data.strong_topics.map(t => (
                <div key={t.topic} className="mb-2">
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="text-gray-300">{t.topic}</span>
                    <span className="text-success">{t.rate}% accuracy</span>
                  </div>
                  <div className="h-1.5 bg-dark-border rounded-full overflow-hidden">
                    <div className="h-full bg-success rounded-full" style={{ width: `${t.rate}%` }} />
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </div>
    </div>
  )
}
