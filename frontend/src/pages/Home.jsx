import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Brain, Clock3, Target, Play, Pause, RotateCcw, LogOut,
  Flame, TrendingUp, CalendarDays, CheckCircle2, History,
  RefreshCw, Globe, LayoutDashboard, Menu, Settings as SettingsIcon,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'

const API_URL = 'http://127.0.0.1:8000'
const SESSION_LENGTH = 25 * 60
const DEFAULT_DAILY_GOAL = 120

function toDate(value) {
  if (!value) return null

  const normalizedValue =
    typeof value === 'string' &&
    !value.endsWith('Z') &&
    !/[+-]\d{2}:\d{2}$/.test(value)
      ? `${value}Z`
      : value

  const date = new Date(normalizedValue)
  return Number.isNaN(date.getTime()) ? null : date
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function getDuration(session) {
  let seconds = Number(session.total_seconds) || 0

  if (session.status === 'running' && session.running_since) {
    const start = toDate(session.running_since)
    if (start) {
      seconds += Math.max(
        0,
        Math.floor((Date.now() - start.getTime()) / 1000),
      )
    }
  }

  return seconds
}

function formatMinutes(seconds) {
  return `${Math.floor(Math.max(0, seconds) / 60)} min`
}

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = Math.floor(total % 60)

  if (hours) return `${hours}h ${minutes}m`
  if (minutes) return `${minutes}m ${secs}s`
  return `${secs}s`
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function chartDataFor(sessions) {
  const result = []
  const now = new Date()

  for (let offset = 6; offset >= 0; offset--) {
    const date = new Date(now)
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - offset)

    const daily = sessions.filter((item) => {
      const created = toDate(item.created_at || item.started_at)
      return created && sameDay(created, date)
    })

    const completedSeconds = daily
      .filter((item) => item.status === 'completed')
      .reduce((sum, item) => sum + getDuration(item), 0)

    result.push({
      day: date.toLocaleDateString('en-IN', {
        weekday: 'short',
      }),
      focus: Math.round(completedSeconds / 60),
    })
  }

  return result
}

function formatDate(value) {
  const date = toDate(value)
  if (!date) return 'Date unavailable'

  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatActivityDate(value) {
  if (!value) return 'Date unavailable'

  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function categoryLabel(category) {
  if (category === 'productive') return 'Productive'
  if (category === 'distracting') return 'Distracting'
  return 'Uncategorized'
}

function categoryClass(category) {
  if (category === 'productive') {
    return 'bg-emerald-50 text-emerald-700'
  }

  if (category === 'distracting') {
    return 'bg-rose-50 text-rose-700'
  }

  return 'bg-slate-100 text-slate-600'
}

export default function Home() {
  const navigate = useNavigate()
  const token = localStorage.getItem('focusflowToken')

  const [seconds, setSeconds] = useState(SESSION_LENGTH)
  const [session, setSession] = useState(null)
  const [isRunning, setIsRunning] = useState(false)
  const [allSessions, setAllSessions] = useState([])
  const [websiteActivity, setWebsiteActivity] = useState([])
  const [dailyGoal, setDailyGoal] = useState(DEFAULT_DAILY_GOAL)
  const [initialLoading, setInitialLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('#overview')

  // AI prediction states
  const [mlPredictions, setMlPredictions] = useState(null)
  const [mlLoading, setMlLoading] = useState(false)
  const [mlError, setMlError] = useState('')
  const [trackingMetrics, setTrackingMetrics] = useState(null)
  const [metricsLoading, setMetricsLoading] = useState(false)

  let user = null

  try {
    user = JSON.parse(
      localStorage.getItem('focusflowUser') || 'null',
    )
  } catch {
    user = null
  }

  const userName =
    user?.name?.trim()?.split(/\s+/)[0] || 'there'

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  const request = useCallback(async (path, options = {}) => {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body
          ? { 'Content-Type': 'application/json' }
          : {}),
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    })

    const data = await response.json().catch(() => ({}))

    if (response.status === 401) {
      localStorage.removeItem('focusflowToken')
      localStorage.removeItem('focusflowUser')
      navigate('/login', { replace: true })

      throw new Error(
        'Your session expired. Please sign in again.',
      )
    }

    if (!response.ok) {
      throw new Error(
        data.detail || data.message || 'Request failed.',
      )
    }

    return data
  }, [navigate, token])

  // Load the browser metrics automatically collected by the Chrome extension.
  const loadTrackingMetrics = useCallback(async () => {
    setMetricsLoading(true)
    try {
      const data = await request(`/api/v1/analytics/metrics?date=${localDateKey()}`)
      setTrackingMetrics(data)
      return data
    } finally {
      setMetricsLoading(false)
    }
  }, [request])

  // Build prediction features from actual FocusFlow records and extension metrics.
  // Some model features are not collected by this extension; those are sent as
  // neutral defaults and explicitly identified in the result note.
  const loadMLPredictions = async () => {
    setMlLoading(true)
    setMlError('')

    try {
      const metrics = await loadTrackingMetrics()
      const latestCompleted = allSessions.find((item) => item.status === 'completed')
      const sourceSession = session || latestCompleted

      if (!sourceSession) {
        throw new Error('Start or complete a focus session before generating predictions.')
      }

      const sessionDurationMinutes = Math.max(0, getDuration(sourceSession) / 60)
      const currentHour = new Date().getHours()
      const timeOfDay = currentHour < 12 ? 'morning' : currentHour < 17 ? 'afternoon' : 'evening'
      const categorySeconds = websiteActivity.reduce((totals, item) => {
        const category = item.category || 'uncategorized'
        totals[category] = (totals[category] || 0) + (Number(item.seconds) || 0)
        return totals
      }, {})
      const websiteCategory = Object.entries(categorySeconds)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'uncategorized'
      const recentCompleted = allSessions
        .filter((item) => item.status === 'completed')
        .slice(0, 5)
      const previousFocusScore = recentCompleted.length
        ? Math.min(100, Math.round(
            recentCompleted.reduce((sum, item) => {
              const planned = Math.max(1, Number(item.goal_minutes) || 25) * 60
              return sum + Math.min(1, getDuration(item) / planned) * 100
            }, 0) / recentCompleted.length,
          ))
        : 0

      const activeMinutes = Math.max(1, (Number(metrics?.active_seconds) || 0) / 60)
      const todayPausedSessions = allSessions.filter((item) => {
        const date = toDate(item.created_at || item.started_at)
        return date && sameDay(date, new Date()) && item.status === 'paused'
      }).length

      const payload = {
        session_duration_min: Number(sessionDurationMinutes.toFixed(2)),
        website_category: websiteCategory,
        current_app: 'Chrome',
        tab_switches_per_min: (Number(metrics?.tab_switches) || 0) / activeMinutes,
        mouse_clicks_per_min: 0,
        keystrokes_per_min: 0,
        idle_time_min: Number(((Number(metrics?.idle_seconds) || 0) / 60).toFixed(2)),
        time_of_day: timeOfDay,
        notifications_received: 0,
        breaks_taken: todayPausedSessions,
        task_goal_match_score: Math.min(1, Math.max(0, focusMinutes / Math.max(1, dailyGoal))),
        previous_focus_score: previousFocusScore,
        sleep_hours_previous_night: 0,
      }

      const data = await request('/api/v1/analytics/predictions', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      // Calculate distraction from collected behaviour, rather than trusting
      // the synthetic-data model's distraction label.
      const todayKey = localDateKey()
      const todaySites = websiteActivity.filter((item) => item.date === todayKey)
      const trackedWebsiteSeconds = todaySites.reduce(
        (sum, item) => sum + (Number(item.seconds) || 0), 0,
      )
      const distractingWebsiteSeconds = todaySites.reduce(
        (sum, item) => sum + (item.category === 'distracting' ? (Number(item.seconds) || 0) : 0),
        0,
      )
      const tabSwitchRate = (Number(metrics?.tab_switches) || 0) / activeMinutes
      const idleSeconds = Number(metrics?.idle_seconds) || 0
      const activeSeconds = Number(metrics?.active_seconds) || 0
      const idlePercent = idleSeconds + activeSeconds > 0
        ? (idleSeconds / (idleSeconds + activeSeconds)) * 100
        : 0
      // Normalize each signal to 0–100. More than 2 switches/min reaches the
      // maximum tab-switch component; website component uses extension labels.
      const tabSwitchComponent = Math.min(100, (tabSwitchRate / 2) * 100)
      const distractingWebsitePercent = trackedWebsiteSeconds > 0
        ? (distractingWebsiteSeconds / trackedWebsiteSeconds) * 100
        : null
      const availableWeights = distractingWebsitePercent === null
        ? { tab: 0.7, idle: 0.3 }
        : { tab: 0.4, idle: 0.3, website: 0.3 }
      const distractionScore = Math.round(
        tabSwitchComponent * availableWeights.tab
        + Math.min(100, idlePercent) * availableWeights.idle
        + (distractingWebsitePercent === null ? 0 : distractingWebsitePercent * availableWeights.website),
      )
      const distractionLabel = distractionScore < 30
        ? 'Low Distraction'
        : distractionScore < 60
          ? 'Moderate Distraction'
          : 'High Distraction'

      setMlPredictions({
        ...data.predictions,
        distraction_analysis: distractionLabel,
        distraction_score: distractionScore,
        distraction_data_available: trackedWebsiteSeconds > 0,
      })
    } catch (err) {
      setMlError(err.message || 'Could not generate predictions.')
    } finally {
      setMlLoading(false)
    }
  }

  const loadProfile = useCallback(async () => {
    const profile = await request('/api/profile')

    const goal = Number(profile.daily_goal_minutes)
    setDailyGoal(
      Number.isFinite(goal) && goal >= 15 && goal <= 720
        ? goal
        : DEFAULT_DAILY_GOAL,
    )

    const savedUser = {
      id: profile.id,
      name: profile.name,
      email: profile.email,
    }

    localStorage.setItem(
      'focusflowUser',
      JSON.stringify(savedUser),
    )
  }, [request])

  const loadSessions = useCallback(async () => {
    const data = await request('/api/sessions?limit=100')

    if (!Array.isArray(data)) {
      throw new Error(
        'Unexpected response from sessions API.',
      )
    }

    setAllSessions(data)

    const active = data.find(
      (item) =>
        item.status === 'running' ||
        item.status === 'paused',
    )

    if (active) {
      setSession(active)
      setIsRunning(active.status === 'running')

      setSeconds(
        Math.max(
          0,
          active.goal_minutes * 60 - getDuration(active),
        ),
      )
    } else {
      setSession(null)
      setIsRunning(false)
      setSeconds(SESSION_LENGTH)
    }
  }, [request])

  const loadWebsiteActivity = useCallback(async () => {
    setActivityLoading(true)
    setActivityError('')

    try {
      const data = await request('/api/activity?days=7')

      if (!Array.isArray(data.activity)) {
        throw new Error(
          'Unexpected response from website activity API.',
        )
      }

      setWebsiteActivity(data.activity)
    } catch (err) {
      setActivityError(
        err.message || 'Could not load website activity.',
      )
    } finally {
      setActivityLoading(false)
    }
  }, [request])

  useEffect(() => {
    if (!token) {
      navigate('/login', { replace: true })
      return
    }

    let cancelled = false

    async function initialize() {
      try {
        await loadProfile()
        await loadSessions()

        if (!cancelled) {
          await loadWebsiteActivity()
          await loadTrackingMetrics()
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
        }
      } finally {
        if (!cancelled) {
          setInitialLoading(false)
        }
      }
    }

    initialize()

    return () => {
      cancelled = true
    }
  }, [
    token,
    navigate,
    loadProfile,
    loadSessions,
    loadWebsiteActivity,
    loadTrackingMetrics,
  ])

  useEffect(() => {
    if (!isRunning || !session) return

    const timer = setInterval(() => {
      setSeconds((previous) => Math.max(0, previous - 1))
    }, 1000)

    return () => clearInterval(timer)
  }, [isRunning, session?.id])

  useEffect(() => {
    if (
      !isRunning ||
      !session ||
      seconds > 0 ||
      loading
    ) {
      return
    }

    finishSession(true)
  }, [seconds, isRunning, session?.id, loading])

  const now = new Date()

  const todaysSessions = allSessions.filter((item) => {
    const date = toDate(item.created_at || item.started_at)
    return date && sameDay(date, now)
  })

  const completedToday = todaysSessions.filter(
    (item) => item.status === 'completed',
  )

  const focusSecondsToday = completedToday.reduce(
    (sum, item) => sum + getDuration(item),
    0,
  )

  const focusMinutes = Math.floor(focusSecondsToday / 60)
  const completedCount = completedToday.length

  const goalProgress = Math.min(
    100,
    Math.round((focusMinutes / dailyGoal) * 100),
  )

  const chartData = chartDataFor(allSessions)

  const averageMinutes = Math.round(
    chartData.reduce((sum, day) => sum + day.focus, 0) / 7,
  )

  const todayActivity = websiteActivity.filter(
    (item) => item.date === localDateKey(),
  )

  const todayWebsiteSeconds = todayActivity.reduce(
    (sum, item) => sum + (Number(item.seconds) || 0),
    0,
  )

  const websiteTotals = Object.values(
    websiteActivity.reduce((groups, item) => {
      const domain = String(item.domain || '').trim()

      if (!domain) return groups

      if (!groups[domain]) {
        groups[domain] = {
          domain,
          seconds: 0,
          category: item.category || 'uncategorized',
          lastDate: item.date || '',
        }
      }

      groups[domain].seconds += Number(item.seconds) || 0

      if (item.date > groups[domain].lastDate) {
        groups[domain].lastDate = item.date
      }

      if (
        item.category &&
        item.category !== 'uncategorized'
      ) {
        groups[domain].category = item.category
      }

      return groups
    }, {}),
  ).sort((a, b) => b.seconds - a.seconds)

  const formatTime = (value) => {
    const mins = Math.floor(value / 60)
      .toString()
      .padStart(2, '0')

    const secs = (value % 60)
      .toString()
      .padStart(2, '0')

    return `${mins}:${secs}`
  }

  const startSession = async () => {
    setLoading(true)
    setError('')
    setNotice('')

    try {
      const data = await request('/api/sessions/start', {
        method: 'POST',
        body: JSON.stringify({ goal_minutes: 25 }),
      })

      setSession(data)
      setSeconds(SESSION_LENGTH)
      setIsRunning(true)

      await loadSessions()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const pauseSession = async () => {
    if (!session) return

    setLoading(true)
    setError('')
    setNotice('')

    try {
      await request(
        `/api/sessions/${session.id}/pause`,
        { method: 'POST' },
      )

      setIsRunning(false)
      await loadSessions()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const resumeSession = async () => {
    if (!session) return

    setLoading(true)
    setError('')
    setNotice('')

    try {
      await request(
        `/api/sessions/${session.id}/resume`,
        { method: 'POST' },
      )

      setIsRunning(true)
      await loadSessions()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function finishSession(timerCompleted = false) {
    if (!session || loading) return

    setIsRunning(false)
    setLoading(true)
    setError('')
    setNotice('')

    try {
      await request(
        `/api/sessions/${session.id}/end`,
        { method: 'POST' },
      )

      setSession(null)
      setSeconds(SESSION_LENGTH)

      await loadSessions()

      setNotice(
        timerCompleted
          ? 'Focus session completed! Your progress has been saved.'
          : 'Session ended and its progress has been saved.',
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleTimerButton = () => {
    if (loading) return

    if (!session) {
      startSession()
    } else if (isRunning) {
      pauseSession()
    } else {
      resumeSession()
    }
  }

  const resetTimer = () => {
    if (session) {
      finishSession(false)
    } else {
      setIsRunning(false)
      setSeconds(SESSION_LENGTH)
      setError('')
      setNotice('')
    }
  }

  const refreshDashboard = async () => {
    setRefreshing(true)
    setError('')

    try {
      await loadProfile()
      await loadSessions()
      await loadWebsiteActivity()
      await loadTrackingMetrics()
    } catch (err) {
      setError(err.message)
    } finally {
      setRefreshing(false)
    }
  }

  const signOut = () => {
    localStorage.removeItem('focusflowToken')
    localStorage.removeItem('focusflowUser')
    navigate('/login', { replace: true })
  }

  const navItems = [
    {
      label: 'Overview',
      href: '#overview',
      icon: <LayoutDashboard size={18} />,
    },
    {
      label: 'Focus analytics',
      href: '#analytics',
      icon: <TrendingUp size={18} />,
    },
    {
      label: 'Focus timer',
      href: '#focus-timer',
      icon: <Clock3 size={18} />,
    },
    {
      label: 'Website activity',
      href: '#website-activity',
      icon: <Globe size={18} />,
    },
    {
      label: 'Session history',
      href: '#session-history',
      icon: <History size={18} />,
    },
  ]
    return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-20 items-center gap-3 border-b border-slate-100 px-6">
          <span className="rounded-xl bg-orange-500 p-2 text-white">
            <Brain size={22} />
          </span>
          <div>
            <p className="text-lg font-bold">FocusFlow</p>
            <p className="text-xs text-slate-400">
              Attention management
            </p>
          </div>
        </div>

        <div className="px-4 pt-6">
          <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Workspace
          </p>

          <nav className="mt-3 space-y-1" aria-label="Dashboard navigation">
            {navItems.map((item) => (
              <button
                key={item.href}
                type="button"
                onClick={() => {
                  setActiveSection(item.href)
                  setMobileNavOpen(false)
                }}
                aria-current={
                  activeSection === item.href ? 'location' : undefined
                }
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition ${
                  activeSection === item.href
                    ? 'bg-orange-50 text-orange-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}

            <button
              type="button"
              onClick={() => {
                setMobileNavOpen(false)
                navigate('/settings')
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
            >
              <SettingsIcon size={18} />
              Settings
            </button>
          </nav>
        </div>

        <div className="mt-auto border-t border-slate-100 p-4">
          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-slate-700">
              <Target size={17} className="text-orange-500" />
              <span className="text-sm font-semibold">
                Daily focus goal
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Aim for {dailyGoal} minutes of completed focus sessions each day.
            </p>
            <button
              type="button"
              onClick={() => navigate('/settings')}
              className="mt-3 text-xs font-semibold text-orange-600 hover:text-orange-700"
            >
              Change goal
            </button>
          </div>
        </div>
      </aside>

      <div className="min-w-0 lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open navigation menu"
                className="rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50 lg:hidden"
              >
                <Menu size={19} />
              </button>
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {{
                    '#overview': 'Overview',
                    '#analytics': 'Focus analytics',
                    '#focus-timer': 'Focus timer',
                    '#website-activity': 'Website activity',
                    '#session-history': 'Session history',
                  }[activeSection] || 'Overview'}
                </p>
                <p className="text-xs text-slate-400">
                  Your attention at a glance
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={refreshDashboard}
                disabled={refreshing}
                title="Refresh dashboard"
                className="rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw
                  size={18}
                  className={refreshing ? 'animate-spin' : ''}
                />
              </button>

              <button
                type="button"
                onClick={() => navigate('/settings')}
                className="flex items-center gap-2 text-sm text-slate-500 hover:text-orange-600"
              >
                <SettingsIcon size={17} />
                <span className="hidden sm:inline">Settings</span>
              </button>

              <button
                type="button"
                onClick={signOut}
                className="flex items-center gap-2 text-sm text-slate-500 hover:text-orange-600"
              >
                <LogOut size={17} />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-5 py-8 md:px-7 md:py-10">
          <div
            id="overview"
            hidden={activeSection !== '#overview'}
            style={{ display: activeSection === '#overview' ? undefined : 'none' }}
            className="mb-8 scroll-mt-24 flex flex-wrap items-end justify-between gap-4"
          >
            <div>
              <p className="text-sm text-slate-500">{today}</p>
              <h1 className="mt-2 text-3xl font-bold md:text-4xl">
                Welcome back, {userName} 👋
              </h1>
              <p className="mt-2 text-slate-500">
                Understand your habits. Protect your attention.
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-full border border-orange-100 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-700">
              <Target size={17} />
              Daily goal: {dailyGoal} minutes
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          {initialLoading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
              Loading your focus analytics...
            </div>
          ) : (
            <>
              {/* Dashboard statistics */}
              <section hidden={activeSection !== '#overview'} style={{ display: activeSection === '#overview' ? undefined : 'none' }} className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  icon={<Clock3 size={21} />}
                  label="Focus time today"
                  value={formatMinutes(focusSecondsToday)}
                  detail="Completed sessions"
                />
                <StatCard
                  icon={<CheckCircle2 size={21} />}
                  label="Sessions completed"
                  value={completedCount}
                  detail="Today"
                />
                <StatCard
                  icon={<TrendingUp size={21} />}
                  label="Daily goal"
                  value={`${goalProgress}%`}
                  detail={`${focusMinutes} of ${dailyGoal} minutes`}
                />
                <StatCard
                  icon={<CalendarDays size={21} />}
                  label="Weekly average"
                  value={formatMinutes(averageMinutes * 60)}
                  detail="Completed focus time per day"
                />
              </section>

              {/* Weekly analytics charts */}
              <section
                id="analytics"
                hidden={activeSection !== '#analytics'}
                style={{ display: activeSection === '#analytics' ? undefined : 'none' }}
                className="mb-8 scroll-mt-24 grid gap-6 xl:grid-cols-5"
              >
                <div className="rounded-3xl border border-slate-200 bg-white p-5 md:p-7 xl:col-span-3">
                  <p className="text-sm font-semibold text-orange-600">
                    YOUR ACTIVITY
                  </p>
                  <h2 className="mt-1 text-xl font-bold">
                    Weekly focus time
                  </h2>
                  <p className="mb-6 mt-1 text-sm text-slate-500">
                    Completed focus minutes over the last 7 days
                  </p>

                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={chartData}
                        margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="#e2e8f0"
                        />
                        <XAxis
                          dataKey="day"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: '#64748b', fontSize: 12 }}
                        />
                        <YAxis
                          allowDecimals={false}
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: '#64748b', fontSize: 12 }}
                        />
                        <Tooltip
                          formatter={(value) => [`${value} min`, 'Focus time']}
                        />
                        <Bar
                          dataKey="focus"
                          fill="#f97316"
                          radius={[6, 6, 0, 0]}
                          maxBarSize={38}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5 md:p-7 xl:col-span-2">
                  <p className="text-sm font-semibold text-orange-600">
                    CONSISTENCY
                  </p>
                  <h2 className="mt-1 text-xl font-bold">Focus trend</h2>
                  <p className="mb-6 mt-1 text-sm text-slate-500">
                    Your completed minutes each day
                  </p>

                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={chartData}
                        margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="#e2e8f0"
                        />
                        <XAxis
                          dataKey="day"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: '#64748b', fontSize: 12 }}
                        />
                        <YAxis
                          allowDecimals={false}
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: '#64748b', fontSize: 12 }}
                        />
                        <Tooltip
                          formatter={(value) => [`${value} min`, 'Focus time']}
                        />
                        <Line
                          type="monotone"
                          dataKey="focus"
                          stroke="#ea580c"
                          strokeWidth={3}
                          dot={{ r: 4, fill: '#ea580c' }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </section>

              {/* AI prediction section */}
              <section
                id="ai-predictions"
                hidden={activeSection !== '#overview'}
                style={{ display: activeSection === '#overview' ? undefined : 'none' }}
                className="mb-8 scroll-mt-24 rounded-3xl border border-slate-200 bg-white p-5 md:p-7"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Brain size={22} className="text-orange-500" />
                      <h2 className="text-xl font-bold">
                        AI Focus Predictions
                      </h2>
                    </div>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                      Use your trained machine-learning models to estimate
                      focus, productivity, attention stability, distraction,
                      and focus degradation risk.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={loadMLPredictions}
                    disabled={mlLoading}
                    className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {mlLoading ? (
                      <RefreshCw size={17} className="animate-spin" />
                    ) : (
                      <Brain size={17} />
                    )}
                    {mlLoading ? 'Generating...' : 'Generate predictions'}
                  </button>
                </div>

                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
                  <strong>Experimental model:</strong> Predictions now use your saved focus-session data, website activity, and automatically collected browser metrics. Clicks, keystrokes, notifications, and sleep are not collected by the extension, so the current model receives zero defaults for those unavailable signals. The models were trained on synthetic data and are not validated real-world assessments.
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricSummary label="Tab switches today" value={metricsLoading ? 'Loading…' : (trackingMetrics?.tab_switches ?? 0)} />
                  <MetricSummary label="Active browser time" value={metricsLoading ? 'Loading…' : formatDuration(trackingMetrics?.active_seconds ?? 0)} />
                  <MetricSummary label="Idle time" value={metricsLoading ? 'Loading…' : formatDuration(trackingMetrics?.idle_seconds ?? 0)} />
                  <MetricSummary label="Metrics status" value={trackingMetrics?.available ? 'Collected' : 'No data yet'} />
                </div>

                {mlError && (
                  <div
                    role="alert"
                    className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700"
                  >
                    {mlError}
                  </div>
                )}

                {mlPredictions && (
                  <div className="mt-6">
                    <h3 className="mb-4 font-semibold text-slate-800">
                      Prediction results
                    </h3>

                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      <PredictionCard
                        label="Focus score"
                        value={mlPredictions.focus_score}
                        suffix="/ 100"
                      />
                      <PredictionCard
                        label="Productivity score"
                        value={mlPredictions.productivity_score}
                        suffix="/ 100"
                      />
                      <PredictionCard
                        label="Attention stability"
                        value={mlPredictions.attention_stability_score}
                        suffix="/ 100"
                      />
                      <PredictionCard
                        label="Distraction analysis"
                        value={`${mlPredictions.distraction_analysis} (${mlPredictions.distraction_score}/100)`}
                        note={mlPredictions.distraction_data_available
                          ? 'Calculated from tab switches, idle time, and website categories'
                          : 'Calculated from tab switches and idle time; no categorized website time available'}
                      />
                      <PredictionCard
                        label="Focus degradation risk"
                        value={mlPredictions.focus_degradation_risk}
                        suffix="/ 100"
                      />
                    </div>
                  </div>
                )}

                {!mlPredictions && !mlLoading && !mlError && (
                  <div className="mt-6 rounded-2xl bg-slate-50 px-4 py-8 text-center">
                    <Brain size={30} className="mx-auto text-slate-300" />
                    <p className="mt-3 font-semibold text-slate-700">
                      No predictions generated yet
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Start or complete a focus session, then generate predictions using your available tracking data.
                    </p>
                  </div>
                )}
              </section>

              {/* Focus timer */}
              <section
                id="focus-timer"
                hidden={activeSection !== '#focus-timer'}
                style={{ display: activeSection === '#focus-timer' ? undefined : 'none' }}
                className="mb-8 scroll-mt-24 grid gap-6 xl:grid-cols-5"
              >
                <div className="rounded-3xl border border-slate-200 bg-white p-6 md:p-8 xl:col-span-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-orange-600">
                        FOCUS SESSION
                      </p>
                      <h2 className="mt-2 text-2xl font-bold">
                        Time to concentrate
                      </h2>
                    </div>
                    <span className="rounded-2xl bg-orange-50 p-3 text-orange-600">
                      <Clock3 size={24} />
                    </span>
                  </div>

                  <div className="flex flex-col items-center py-7">
                    <div className="flex h-52 w-52 flex-col items-center justify-center rounded-full border-[10px] border-orange-100">
                      <span className="text-5xl font-bold tracking-tight tabular-nums">
                        {formatTime(seconds)}
                      </span>
                      <span className="mt-2 text-sm text-slate-500">
                        {isRunning
                          ? 'Stay focused'
                          : session
                            ? 'Session paused'
                            : 'Ready when you are'}
                      </span>
                    </div>

                    <div className="mt-7 flex gap-3">
                      <button
                        type="button"
                        onClick={handleTimerButton}
                        disabled={loading || initialLoading}
                        className="flex items-center gap-2 rounded-xl bg-orange-500 px-6 py-3 font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
                      >
                        {isRunning ? (
                          <Pause size={18} />
                        ) : (
                          <Play size={18} />
                        )}
                        {loading
                          ? 'Please wait...'
                          : isRunning
                            ? 'Pause'
                            : session
                              ? 'Resume'
                              : 'Start focus'}
                      </button>

                      <button
                        type="button"
                        onClick={resetTimer}
                        disabled={loading || !session}
                        aria-label="End focus session"
                        title="End focus session"
                        className="rounded-xl border border-slate-200 p-3 hover:bg-slate-50 disabled:opacity-50"
                      >
                        <RotateCcw size={19} />
                      </button>
                    </div>

                    <p className="mt-4 text-xs text-slate-400">
                      {session
                        ? `${session.goal_minutes}-minute session`
                        : '25-minute focus session'}
                    </p>

                    {notice && (
                      <p
                        role="status"
                        className="mt-4 text-center text-sm text-emerald-700"
                      >
                        {notice}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-6 xl:col-span-2">
                  <div className="rounded-3xl bg-slate-950 p-7 text-white">
                    <div className="w-fit rounded-xl bg-orange-500/15 p-3 text-orange-400">
                      <Flame size={24} />
                    </div>
                    <h3 className="mt-5 text-xl font-bold">
                      Today's focus tip
                    </h3>
                    <p className="mt-3 leading-7 text-slate-300">
                      Silence unnecessary notifications and work on one task
                      at a time. Small changes can make a big difference.
                    </p>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-white p-7">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-bold">
                        Daily goal progress
                      </h3>
                      <Target size={21} className="text-orange-500" />
                    </div>

                    <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-orange-500 transition-all"
                        style={{ width: `${goalProgress}%` }}
                      />
                    </div>

                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className="text-slate-500">
                        {focusMinutes} / {dailyGoal} min
                      </span>
                      <span className="font-semibold text-orange-600">
                        {goalProgress}%
                      </span>
                    </div>

                    <p className="mt-4 text-sm text-slate-500">
                      {goalProgress >= 100
                        ? 'Daily goal achieved. Great work!'
                        : `${Math.max(0, dailyGoal - focusMinutes)} more minutes to reach your goal.`}
                    </p>

                    <button
                      type="button"
                      onClick={() => navigate('/settings')}
                      className="mt-4 text-sm font-semibold text-orange-600 hover:text-orange-700"
                    >
                      Change daily goal
                    </button>
                  </div>
                </div>
              </section>
                            {/* Website activity */}
              <section
                id="website-activity"
                hidden={activeSection !== '#website-activity'}
                style={{ display: activeSection === '#website-activity' ? undefined : 'none' }}
                className="mb-8 scroll-mt-24 rounded-3xl border border-slate-200 bg-white p-5 md:p-7"
              >
                <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Globe size={21} className="text-orange-500" />
                      <h2 className="text-xl font-bold">
                        Website activity
                      </h2>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      Browsing activity synced from your FocusFlow Chrome extension
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={loadWebsiteActivity}
                    disabled={activityLoading}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <RefreshCw
                      size={15}
                      className={activityLoading ? 'animate-spin' : ''}
                    />
                    Refresh activity
                  </button>
                </div>

                <div className="mb-6 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl bg-orange-50 p-5">
                    <p className="text-sm text-orange-700">
                      Today's browsing time
                    </p>
                    <p className="mt-2 text-3xl font-bold text-orange-700">
                      {formatDuration(todayWebsiteSeconds)}
                    </p>
                    <p className="mt-1 text-xs text-orange-700/80">
                      {todayActivity.length} recorded website entries today
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-100 p-5">
                    <p className="text-sm text-slate-500">
                      Websites in the last 7 days
                    </p>
                    <p className="mt-2 text-3xl font-bold">
                      {websiteTotals.length}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Total tracked time:{' '}
                      {formatDuration(
                        websiteTotals.reduce(
                          (sum, site) => sum + site.seconds,
                          0,
                        ),
                      )}
                    </p>
                  </div>
                </div>

                {activityError && (
                  <div
                    role="alert"
                    className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700"
                  >
                    {activityError}
                  </div>
                )}

                {activityLoading && websiteActivity.length === 0 ? (
                  <div className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    Loading website activity...
                  </div>
                ) : websiteTotals.length === 0 ? (
                  <div className="rounded-2xl bg-slate-50 px-4 py-10 text-center">
                    <Globe size={30} className="mx-auto text-slate-300" />
                    <p className="mt-3 font-semibold">
                      No synced website activity yet
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Sync activity from the extension, then refresh this section.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                          <th className="px-3 py-3 font-medium">Website</th>
                          <th className="px-3 py-3 font-medium">
                            Tracked time
                          </th>
                          <th className="px-3 py-3 font-medium">Category</th>
                          <th className="px-3 py-3 font-medium">
                            Last tracked
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {websiteTotals.map((site) => (
                          <tr
                            key={site.domain}
                            className="border-b border-slate-50 last:border-0"
                          >
                            <td className="px-3 py-4">
                              <div className="flex items-center gap-2">
                                <span className="rounded-lg bg-slate-100 p-2 text-slate-500">
                                  <Globe size={16} />
                                </span>
                                <span className="max-w-[220px] break-all font-medium text-slate-800">
                                  {site.domain}
                                </span>
                              </div>
                            </td>

                            <td className="px-3 py-4 font-semibold text-slate-700">
                              {formatDuration(site.seconds)}
                            </td>

                            <td className="px-3 py-4">
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${categoryClass(site.category)}`}
                              >
                                {categoryLabel(site.category)}
                              </span>
                            </td>

                            <td className="px-3 py-4 text-slate-500">
                              {formatActivityDate(site.lastDate)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <p className="mt-4 text-xs text-slate-400">
                  Activity appears here after it has been synced from the extension to your account.
                </p>
              </section>

              {/* Recent focus sessions */}
              <section
                id="session-history"
                hidden={activeSection !== '#session-history'}
                style={{ display: activeSection === '#session-history' ? undefined : 'none' }}
                className="scroll-mt-24 rounded-3xl border border-slate-200 bg-white p-5 md:p-7"
              >
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <History size={20} className="text-orange-500" />
                      <h2 className="text-xl font-bold">
                        Recent focus sessions
                      </h2>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      Your latest sessions saved in FocusFlow
                    </p>
                  </div>

                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                    Latest {Math.min(allSessions.length, 8)}
                  </span>
                </div>

                {allSessions.length === 0 ? (
                  <div className="rounded-2xl bg-slate-50 px-4 py-10 text-center">
                    <Clock3 size={30} className="mx-auto text-slate-300" />
                    <p className="mt-3 font-semibold">
                      No focus sessions yet
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Start your first session and your history will appear here.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                          <th className="px-3 py-3 font-medium">Session</th>
                          <th className="px-3 py-3 font-medium">Planned</th>
                          <th className="px-3 py-3 font-medium">Recorded</th>
                          <th className="px-3 py-3 font-medium">Status</th>
                        </tr>
                      </thead>

                      <tbody>
                        {allSessions.slice(0, 8).map((item) => (
                          <tr
                            key={item.id}
                            className="border-b border-slate-50 last:border-0"
                          >
                            <td className="px-3 py-4">
                              <p className="font-medium text-slate-800">
                                Focus session
                              </p>
                              <p className="mt-1 text-xs text-slate-400">
                                {formatDate(
                                  item.created_at || item.started_at,
                                )}
                              </p>
                            </td>

                            <td className="px-3 py-4 text-slate-600">
                              {item.goal_minutes} min
                            </td>

                            <td className="px-3 py-4 text-slate-600">
                              {formatMinutes(getDuration(item))}
                            </td>

                            <td className="px-3 py-4">
                              <StatusBadge status={item.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <p className="mt-4 text-xs text-slate-400">
                  Analytics use the latest 100 focus sessions returned by the API.
                </p>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  )
}

/* Dashboard statistic card */
function StatCard({ icon, label, value, detail }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{label}</p>
        <span className="rounded-xl bg-orange-50 p-2 text-orange-500">
          {icon}
        </span>
      </div>

      <p className="mt-4 text-3xl font-bold">{value}</p>
      <p className="mt-2 text-xs text-slate-400">{detail}</p>
    </div>
  )
}

/* Session status badge */
function StatusBadge({ status }) {
  const styles = {
    completed: 'bg-emerald-50 text-emerald-700',
    running: 'bg-orange-50 text-orange-700',
    paused: 'bg-amber-50 text-amber-700',
  }

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
        styles[status] || 'bg-slate-100 text-slate-600'
      }`}
    >
      {status || 'unknown'}
    </span>
  )
}

/* Automatically collected metric summary card */
function MetricSummary({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-bold text-slate-900">{value}</p>
    </div>
  )
}

/* AI prediction result card */
function PredictionCard({ label, value, suffix = '', note = 'Experimental model estimate' }) {
  const displayValue =
    typeof value === 'number' ? Number(value.toFixed(2)) : value

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <p className="text-sm text-slate-500">{label}</p>

      <p className="mt-3 break-words text-2xl font-bold text-slate-900">
        {displayValue ?? '—'}
        {suffix && (
          <span className="ml-1 text-sm font-medium text-slate-400">
            {suffix}
          </span>
        )}
      </p>

      <p className="mt-2 text-xs text-slate-400">
        {note}
      </p>
    </div>
  )
}