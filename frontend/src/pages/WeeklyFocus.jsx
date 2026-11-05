import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, CalendarDays, CheckCircle2, Clock3, RefreshCw,
  Target, TrendingUp,
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

const API_URL = 'http://127.0.0.1:8000'

function formatDuration(seconds = 0) {
  const totalMinutes = Math.floor(Math.max(0, Number(seconds) || 0) / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours && minutes) return `${hours}h ${minutes}m`
  if (hours) return `${hours}h`
  return `${minutes}m`
}

function formatDateRange(start, end) {
  if (!start || !end) return 'This week'
  const options = { day: 'numeric', month: 'short' }
  const first = new Date(`${start}T00:00:00`)
  const last = new Date(`${end}T00:00:00`)
  return `${first.toLocaleDateString('en-IN', options)} – ${last.toLocaleDateString('en-IN', options)}`
}

function SummaryCard({ icon, label, value, detail }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{label}</p>
        <span className="rounded-xl bg-orange-50 p-2 text-orange-600">{icon}</span>
      </div>
      <p className="mt-4 text-3xl font-bold text-slate-900">{value}</p>
      <p className="mt-2 text-xs text-slate-400">{detail}</p>
    </div>
  )
}

export default function WeeklyFocus() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const loadWeeklyFocus = useCallback(async () => {
    const token = localStorage.getItem('focusflowToken')
    if (!token) {
      navigate('/login', { replace: true })
      return
    }

    const response = await fetch(`${API_URL}/api/v1/analytics/weekly-focus`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const result = await response.json().catch(() => ({}))

    if (response.status === 401) {
      localStorage.removeItem('focusflowToken')
      localStorage.removeItem('focusflowUser')
      navigate('/login', { replace: true })
      throw new Error('Your session expired. Please sign in again.')
    }
    if (!response.ok) {
      throw new Error(result.detail || 'Could not load weekly focus data.')
    }
    setData(result)
  }, [navigate])

  useEffect(() => {
    let active = true
    async function initialize() {
      try {
        await loadWeeklyFocus()
      } catch (err) {
        if (active) setError(err.message || 'Could not load weekly focus data.')
      } finally {
        if (active) setLoading(false)
      }
    }
    initialize()
    return () => { active = false }
  }, [loadWeeklyFocus])

  const refresh = async () => {
    setRefreshing(true)
    setError('')
    try {
      await loadWeeklyFocus()
    } catch (err) {
      setError(err.message || 'Could not refresh weekly focus data.')
    } finally {
      setRefreshing(false)
    }
  }

  const chartData = useMemo(() => (data?.daily || []).map((day) => ({
    ...day,
    focus: Math.round(Number(day.focus_minutes) || 0),
  })), [data])

  const progress = Math.min(100, Math.max(0, Number(data?.weekly_goal_progress) || 0))
  const totalSeconds = Number(data?.total_focus_seconds) || 0
  const averageSeconds = (Number(data?.average_daily_focus_minutes) || 0) * 60

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-7">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-orange-500 p-2 text-white"><CalendarDays size={21} /></span>
            <div>
              <p className="font-bold">Weekly Focus</p>
              <p className="text-xs text-slate-400">Your focus progress, week by week</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={refresh} disabled={refreshing || loading} className="rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50" title="Refresh weekly focus">
              <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button type="button" onClick={() => navigate('/')} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
              <ArrowLeft size={16} /> <span className="hidden sm:inline">Dashboard</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-8 md:px-7 md:py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-orange-600">WEEKLY OVERVIEW</p>
            <h1 className="mt-2 text-3xl font-bold md:text-4xl">Your focus this week</h1>
            <p className="mt-2 text-slate-500">{formatDateRange(data?.week_start, data?.week_end)} · Monday to Sunday · IST</p>
          </div>
          <div className="rounded-full border border-orange-100 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-700">
            {data?.timezone || 'Asia/Kolkata'}
          </div>
        </div>

        {error && <div role="alert" className="mb-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">Loading your weekly focus...</div>
        ) : data ? (
          <>
            <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard icon={<Clock3 size={20} />} label="Total focus time" value={formatDuration(totalSeconds)} detail="Recorded this week" />
              <SummaryCard icon={<CheckCircle2 size={20} />} label="Completed sessions" value={data.completed_sessions ?? 0} detail={`${data.total_sessions ?? 0} total sessions started`} />
              <SummaryCard icon={<TrendingUp size={20} />} label="Daily average" value={formatDuration(averageSeconds)} detail="Weekly focus time ÷ 7 days" />
              <SummaryCard icon={<Target size={20} />} label="Weekly goal" value={`${Math.round(progress)}%`} detail={`${formatDuration(totalSeconds)} of ${formatDuration((data.weekly_goal_minutes || 0) * 60)}`} />
            </section>

            <section className="grid gap-6 xl:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 md:p-7 xl:col-span-2">
                <div className="mb-6">
                  <p className="text-sm font-semibold text-orange-600">DAILY BREAKDOWN</p>
                  <h2 className="mt-1 text-xl font-bold">Focus time by day</h2>
                  <p className="mt-1 text-sm text-slate-500">Total recorded focus minutes for each day of this week</p>
                </div>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                      <Tooltip formatter={(value) => [`${value} min`, 'Focus time']} />
                      <Bar dataKey="focus" fill="#f97316" radius={[7, 7, 0, 0]} maxBarSize={44} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5 md:p-7">
                <p className="text-sm font-semibold text-orange-600">WEEKLY TARGET</p>
                <h2 className="mt-1 text-xl font-bold">Goal progress</h2>
                <p className="mt-1 text-sm text-slate-500">Based on your saved daily focus goal</p>
                <div className="mt-8">
                  <div className="mb-2 flex items-end justify-between gap-3">
                    <span className="text-3xl font-bold">{Math.round(progress)}%</span>
                    <span className="text-sm text-slate-500">{formatDuration(totalSeconds)} / {formatDuration((data.weekly_goal_minutes || 0) * 60)}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="mt-4 text-sm leading-6 text-slate-500">
                    {progress >= 100
                      ? 'Great work! You have reached your weekly focus goal.'
                      : `${formatDuration(Math.max(0, (Number(data.weekly_goal_minutes) || 0) * 60 - totalSeconds))} remaining to reach your weekly goal.`}
                  </p>
                </div>
                <div className="mt-8 border-t border-slate-100 pt-5">
                  <p className="text-sm text-slate-500">Daily target</p>
                  <p className="mt-1 text-lg font-bold">{data.daily_goal_minutes} minutes</p>
                  <p className="mt-1 text-xs text-slate-400">Weekly target = daily target × 7</p>
                </div>
              </div>
            </section>

            <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 md:p-7">
              <div className="mb-5">
                <h2 className="text-xl font-bold">Daily session summary</h2>
                <p className="mt-1 text-sm text-slate-500">Focus time and completed sessions from Monday through Sunday</p>
              </div>
              <div className="divide-y divide-slate-100">
                {(data.daily || []).map((day) => (
                  <div key={day.date} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-semibold text-slate-800">{new Date(`${day.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long' })}</p>
                      <p className="text-xs text-slate-400">{new Date(`${day.date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-800">{formatDuration((Number(day.focus_minutes) || 0) * 60)}</p>
                      <p className="text-xs text-slate-400">{day.completed_sessions} completed · {day.sessions} sessions</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">Weekly focus data is not available yet.</div>
        )}
      </main>
    </div>
  )
}
