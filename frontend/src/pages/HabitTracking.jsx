import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Check, CheckCircle2, Circle, Flame, ListChecks,
  LoaderCircle, Plus, RefreshCw, Target, Trash2, TrendingUp,
} from 'lucide-react'
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip,
  XAxis, YAxis,
} from 'recharts'

const API_URL = 'http://127.0.0.1:8000'

function formatDay(value) {
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function HabitTracking() {
  const navigate = useNavigate()
  const token = localStorage.getItem('focusflowToken')

  const [habits, setHabits] = useState([])
  const [progress, setProgress] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyHabit, setBusyHabit] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const request = useCallback(async (path, options = {}) => {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    })
    const data = await response.json().catch(() => ({}))
    if (response.status === 401) {
      localStorage.removeItem('focusflowToken')
      localStorage.removeItem('focusflowUser')
      navigate('/login', { replace: true })
      throw new Error('Your session expired. Please sign in again.')
    }
    if (!response.ok) {
      throw new Error(data.detail || data.message || 'Request failed.')
    }
    return data
  }, [navigate, token])

  const loadData = useCallback(async () => {
    setError('')
    const [habitData, progressData] = await Promise.all([
      request(`/api/habits?include_archived=${showArchived}`),
      request('/api/habits/progress?days=7'),
    ])
    setHabits(habitData.habits || [])
    setProgress(progressData)
  }, [request, showArchived])

  useEffect(() => {
    if (!token) {
      navigate('/login', { replace: true })
      return
    }
    let cancelled = false
    async function initialize() {
      try {
        await loadData()
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not load habits.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    initialize()
    return () => { cancelled = true }
  }, [token, navigate, loadData])

  const activeHabits = useMemo(
    () => habits.filter((habit) => habit.is_active),
    [habits],
  )
  const completedToday = activeHabits.filter((habit) => habit.completed_today).length
  const completionPercent = activeHabits.length
    ? Math.round((completedToday / activeHabits.length) * 100)
    : 0

  const handleCreate = async (event) => {
    event.preventDefault()
    if (!title.trim()) {
      setError('Enter a habit name before saving.')
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await request('/api/habits', {
        method: 'POST',
        body: JSON.stringify({ title: title.trim(), description: description.trim() }),
      })
      setTitle('')
      setDescription('')
      setNotice('Habit created successfully.')
      await loadData()
    } catch (err) {
      setError(err.message || 'Could not create habit.')
    } finally {
      setSaving(false)
    }
  }

  const toggleCompletion = async (habit) => {
    setBusyHabit(habit.id)
    setError('')
    setNotice('')
    try {
      await request(`/api/habits/${habit.id}/complete`, {
        method: habit.completed_today ? 'DELETE' : 'POST',
      })
      await loadData()
      setNotice(habit.completed_today
        ? 'Today’s check-in was undone.'
        : 'Habit marked complete for today.')
    } catch (err) {
      setError(err.message || 'Could not update habit completion.')
    } finally {
      setBusyHabit('')
    }
  }

  const archiveHabit = async (habit) => {
    const action = habit.is_active ? 'archive' : 'restore'
    if (!window.confirm(`Are you sure you want to ${action} “${habit.title}”?`)) return
    setBusyHabit(habit.id)
    setError('')
    try {
      await request(`/api/habits/${habit.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !habit.is_active }),
      })
      await loadData()
      setNotice(`Habit ${action}d.`)
    } catch (err) {
      setError(err.message || `Could not ${action} habit.`)
    } finally {
      setBusyHabit('')
    }
  }

  const deleteHabit = async (habit) => {
    if (!window.confirm(`Permanently delete “${habit.title}” and all its completion history?`)) return
    setBusyHabit(habit.id)
    setError('')
    try {
      await request(`/api/habits/${habit.id}`, { method: 'DELETE' })
      await loadData()
      setNotice('Habit and its completion history deleted.')
    } catch (err) {
      setError(err.message || 'Could not delete habit.')
    } finally {
      setBusyHabit('')
    }
  }

  const chartData = (progress?.daily_progress || []).map((day) => ({
    ...day,
    label: formatDay(day.date).split(',')[0] + ' ' + formatDay(day.date).split(' ').slice(1).join(' '),
  }))

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-orange-500 p-2 text-white"><ListChecks size={21} /></span>
            <div>
              <p className="font-bold">FocusFlow</p>
              <p className="text-xs text-slate-400">Habit tracking</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <ArrowLeft size={16} /> Back to dashboard
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-8 md:px-7 md:py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-orange-600">BUILD CONSISTENCY</p>
            <h1 className="mt-2 text-3xl font-bold md:text-4xl">Habit tracking</h1>
            <p className="mt-2 text-slate-500">Small daily actions build lasting focus habits.</p>
          </div>
          <button
            type="button"
            onClick={() => loadData().catch((err) => setError(err.message))}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw size={16} /> Refresh
          </button>
        </div>

        {error && <div role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {notice && <div role="status" className="mb-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</div>}

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-500">
            <LoaderCircle className="mx-auto animate-spin" size={26} />
            <p className="mt-3">Loading your habits...</p>
          </div>
        ) : (
          <>
            <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard icon={<Target size={20} />} label="Active habits" value={activeHabits.length} detail="Habits you are currently tracking" />
              <SummaryCard icon={<CheckCircle2 size={20} />} label="Completed today" value={`${completedToday}/${activeHabits.length}`} detail="Daily check-ins completed" />
              <SummaryCard icon={<TrendingUp size={20} />} label="Today's progress" value={`${completionPercent}%`} detail="Based on active habits" />
              <SummaryCard icon={<Flame size={20} />} label="Total check-ins" value={progress?.completed_check_ins ?? 0} detail="Across the last 7 days" />
            </section>

            <section className="mb-6 grid gap-6 xl:grid-cols-5">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 md:p-7 xl:col-span-3">
                <div className="mb-5">
                  <p className="text-sm font-semibold text-orange-600">CONSISTENCY</p>
                  <h2 className="mt-1 text-xl font-bold">Weekly habit progress</h2>
                  <p className="mt-1 text-sm text-slate-500">Daily completion percentage over the last seven days</p>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                      <Tooltip formatter={(value) => [`${value}%`, 'Completion']} labelFormatter={(label) => label} />
                      <Line type="monotone" dataKey="completion_percentage" stroke="#f97316" strokeWidth={3} dot={{ r: 4, fill: '#f97316' }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5 md:p-7 xl:col-span-2">
                <p className="text-sm font-semibold text-orange-600">WEEKLY SUMMARY</p>
                <h2 className="mt-1 text-xl font-bold">Your consistency</h2>
                <p className="mt-1 text-sm text-slate-500">{progress?.start_date || '—'} to {progress?.end_date || '—'}</p>
                <p className="mt-7 text-5xl font-bold">{progress?.overall_completion_percentage ?? 0}<span className="text-2xl text-slate-400">%</span></p>
                <p className="mt-2 text-sm text-slate-500">Overall completion rate</p>
                <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${progress?.overall_completion_percentage ?? 0}%` }} />
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Completed</p>
                    <p className="mt-1 text-xl font-bold">{progress?.completed_check_ins ?? 0}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Possible</p>
                    <p className="mt-1 text-xl font-bold">{progress?.possible_check_ins ?? 0}</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid items-start gap-6 xl:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 md:p-6 xl:col-span-2">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold">Your habits</h2>
                    <p className="mt-1 text-sm text-slate-500">Check in once each day to build your streak.</p>
                  </div>
                  <button type="button" onClick={() => setShowArchived((value) => !value)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                    {showArchived ? 'Hide archived' : 'Show archived'}
                  </button>
                </div>

                {habits.length === 0 ? (
                  <div className="rounded-2xl bg-slate-50 px-4 py-10 text-center">
                    <ListChecks size={30} className="mx-auto text-slate-300" />
                    <p className="mt-3 font-semibold text-slate-700">No habits found</p>
                    <p className="mt-1 text-sm text-slate-500">Create your first habit using the form.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {habits.map((habit) => (
                      <article key={habit.id} className={`rounded-2xl border p-4 ${habit.completed_today ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white'}`}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <span className={`mt-0.5 rounded-xl p-2 ${habit.completed_today ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-50 text-orange-600'}`}>
                              {habit.completed_today ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                            </span>
                            <div className="min-w-0">
                              <h3 className="break-words font-semibold text-slate-800">{habit.title}</h3>
                              {habit.description && <p className="mt-1 text-sm text-slate-500">{habit.description}</p>}
                              <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                                <span className="inline-flex items-center gap-1"><Flame size={14} className="text-orange-500" /> {habit.current_streak} day streak</span>
                                <span>{habit.completed_today ? 'Completed today' : 'Not completed today'}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {habit.is_active && (
                              <button type="button" onClick={() => toggleCompletion(habit)} disabled={busyHabit === habit.id} className={`rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-50 ${habit.completed_today ? 'border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50' : 'bg-orange-500 text-white hover:bg-orange-600'}`}>
                                {busyHabit === habit.id ? 'Saving…' : habit.completed_today ? 'Undo check-in' : <><Check size={14} className="mr-1 inline" /> Mark complete</>}
                              </button>
                            )}
                            <button type="button" onClick={() => archiveHabit(habit)} disabled={busyHabit === habit.id} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                              {habit.is_active ? 'Archive' : 'Restore'}
                            </button>
                            <button type="button" onClick={() => deleteHabit(habit)} disabled={busyHabit === habit.id} aria-label={`Delete ${habit.title}`} title="Permanently delete habit" className="rounded-xl border border-rose-100 p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>

              <form onSubmit={handleCreate} className="rounded-3xl border border-slate-200 bg-white p-5 md:p-6">
                <div className="flex items-center gap-2">
                  <span className="rounded-xl bg-orange-50 p-2 text-orange-600"><Plus size={19} /></span>
                  <h2 className="text-xl font-bold">Add a habit</h2>
                </div>
                <p className="mt-2 text-sm text-slate-500">Choose a small action you want to repeat every day.</p>
                <label className="mt-5 block text-sm font-medium text-slate-700" htmlFor="habit-title">Habit name</label>
                <input id="habit-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} required placeholder="e.g. Complete 2 focus sessions" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
                <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="habit-description">Description <span className="font-normal text-slate-400">(optional)</span></label>
                <textarea id="habit-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={240} rows={3} placeholder="Add a short reminder or target" className="mt-2 w-full resize-y rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
                <button type="submit" disabled={saving} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60">
                  {saving ? <LoaderCircle size={17} className="animate-spin" /> : <Plus size={17} />}
                  {saving ? 'Creating…' : 'Create habit'}
                </button>
                <p className="mt-3 text-xs leading-5 text-slate-400">You can check in once per day. Your streak is calculated from consecutive calendar dates.</p>
              </form>
            </section>
          </>
        )}
      </main>
    </div>
  )
}

function SummaryCard({ icon, label, value, detail }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{label}</p>
        <span className="rounded-xl bg-orange-50 p-2 text-orange-500">{icon}</span>
      </div>
      <p className="mt-4 text-3xl font-bold">{value}</p>
      <p className="mt-2 text-xs text-slate-400">{detail}</p>
    </div>
  )
}
