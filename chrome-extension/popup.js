
const API_BASE_URL = 'http://127.0.0.1:8000'
const TOKEN_KEY = 'focusflowToken'
const EMAIL_KEY = 'focusflowEmail'
const ACTIVITY_KEY = 'focusflowActivity'
const METRICS_KEY = 'focusflowMetrics'

const elements = {
  loginSection: document.getElementById('loginSection'),
  activitySection: document.getElementById('activitySection'),
  loginForm: document.getElementById('loginForm'),
  loginButton: document.getElementById('loginButton'),
  logoutButton: document.getElementById('logoutButton'),
  syncButton: document.getElementById('syncButton'),
  refreshButton: document.getElementById('refreshButton'),
  email: document.getElementById('email'),
  password: document.getElementById('password'),
  accountEmail: document.getElementById('accountEmail'),
  totalTime: document.getElementById('totalTime'),
  siteCount: document.getElementById('siteCount'),
  activityList: document.getElementById('activityList'),
  connectionBadge: document.getElementById('connectionBadge'),
  statusMessage: document.getElementById('statusMessage'),
  lastSync: document.getElementById('lastSync'),
}

function showStatus(message, type = '') {
  elements.statusMessage.textContent = message
  elements.statusMessage.className = `status ${type}`
}

function setConnectionStatus(online) {
  elements.connectionBadge.textContent = online ? 'Connected' : 'Offline'
  elements.connectionBadge.className = `badge ${online ? 'online' : 'offline'}`
}

function getTodayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const remaining = total % 60

  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${remaining}s`
  return `${remaining}s`
}

async function getLocalActivity() {
  const result = await chrome.storage.local.get(ACTIVITY_KEY)
  return result[ACTIVITY_KEY] || {}
}

async function getLocalMetrics() {
  const result = await chrome.storage.local.get(METRICS_KEY)
  return result[METRICS_KEY] || {}
}

function renderActivity(activity) {
  const today = activity[getTodayKey()] || {}

  const sites = Object.entries(today)
    .filter(([domain, entry]) =>
      domain &&
      domain !== 'null' &&
      entry &&
      Number.isFinite(Number(entry.seconds))
    )
    .map(([domain, entry]) => ({
      domain,
      seconds: Math.max(0, Number(entry.seconds)),
    }))
    .sort((a, b) => b.seconds - a.seconds)

  const totalSeconds = sites.reduce((sum, site) => sum + site.seconds, 0)

  elements.totalTime.textContent = formatDuration(totalSeconds)
  elements.siteCount.textContent =
    `${sites.length} website${sites.length === 1 ? '' : 's'} tracked`

  elements.activityList.replaceChildren()

  if (!sites.length) {
    const empty = document.createElement('p')
    empty.className = 'empty-state'
    empty.textContent = 'No activity recorded today yet.'
    elements.activityList.appendChild(empty)
    return
  }

  sites.slice(0, 8).forEach((site) => {
    const item = document.createElement('div')
    item.className = 'activity-item'

    const name = document.createElement('span')
    name.className = 'site-name'
    name.textContent = site.domain
    name.title = site.domain

    const time = document.createElement('span')
    time.className = 'site-time'
    time.textContent = formatDuration(site.seconds)

    item.append(name, time)
    elements.activityList.appendChild(item)
  })
}

async function loadActivity() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_ACTIVITY' })

  if (response?.error) throw new Error(response.error)

  renderActivity(response?.activity || {})
}

async function showLoggedInView() {
  const stored = await chrome.storage.local.get([TOKEN_KEY, EMAIL_KEY])

  if (!stored[TOKEN_KEY]) {
    elements.loginSection.classList.remove('hidden')
    elements.activitySection.classList.add('hidden')
    setConnectionStatus(false)
    return
  }

  elements.loginSection.classList.add('hidden')
  elements.activitySection.classList.remove('hidden')
  elements.accountEmail.textContent = stored[EMAIL_KEY] || 'FocusFlow user'

  try {
    await loadActivity()
  } catch (error) {
    showStatus(error.message || 'Could not load activity.', 'error')
  }

  setConnectionStatus(true)
}

async function apiRequest(path, token, body) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  const data = await response.json().catch(() => ({}))

  if (response.status === 401 || response.status === 403) {
    throw new Error('AUTH_EXPIRED')
  }

  if (!response.ok) {
    const detail = Array.isArray(data.detail)
      ? data.detail.map((item) => item.msg).join(', ')
      : data.detail

    throw new Error(detail || `Request failed (${response.status}).`)
  }

  return data
}

elements.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault()

  const email = elements.email.value.trim()
  const password = elements.password.value

  elements.loginButton.disabled = true
  elements.loginButton.textContent = 'Logging in...'
  showStatus('')

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      const detail = Array.isArray(data.detail)
        ? data.detail.map((item) => item.msg).join(', ')
        : data.detail

      throw new Error(detail || `Login failed (${response.status}).`)
    }

    const token = data.access_token || data.token
    if (!token) throw new Error('The login response did not contain a token.')

    await chrome.storage.local.set({
      [TOKEN_KEY]: token,
      [EMAIL_KEY]: data.user?.email || data.email || email,
    })

    elements.password.value = ''
    await showLoggedInView()
    showStatus('Successfully logged in.', 'success')
  } catch (error) {
    setConnectionStatus(false)
    showStatus(error.message || 'Could not connect to FocusFlow.', 'error')
  } finally {
    elements.loginButton.disabled = false
    elements.loginButton.textContent = 'Log in'
  }
})

elements.refreshButton.addEventListener('click', async () => {
  try {
    await loadActivity()
    showStatus('Activity refreshed.', 'success')
  } catch (error) {
    showStatus(error.message || 'Could not refresh activity.', 'error')
  }
})

elements.syncButton.addEventListener('click', async () => {
  elements.syncButton.disabled = true
  elements.syncButton.textContent = 'Syncing...'
  showStatus('Syncing website activity and tracking metrics...')

  let websiteSynced = false

  try {
    const stored = await chrome.storage.local.get(TOKEN_KEY)
    const token = stored[TOKEN_KEY]

    if (!token) throw new Error('Please log in before syncing.')

    // 1. Preserve the existing website activity sync.
    const activity = await getLocalActivity()
    const entries = []

    for (const [date, domains] of Object.entries(activity)) {
      for (const [domain, details] of Object.entries(domains || {})) {
        if (
          !domain ||
          domain === 'null' ||
          !details ||
          !Number.isFinite(Number(details.seconds))
        ) continue

        entries.push({
          date,
          domain,
          seconds: Math.max(0, Math.floor(Number(details.seconds))),
          category: [
            'productive',
            'distracting',
            'uncategorized',
          ].includes(details.category)
            ? details.category
            : 'uncategorized',
        })
      }
    }

    if (entries.length) {
      const result = await apiRequest('/api/activity/sync', token, { entries })
      websiteSynced = true
      showStatus(
        `Website activity synced (${result.saved ?? entries.length} records). Syncing metrics...`
      )
    } else {
      websiteSynced = true
    }

    // 2. Sync the metrics collected by background.js.
    const metricsByDate = await getLocalMetrics()
    const metrics = Object.entries(metricsByDate)
      .filter(([date, value]) =>
        /^\d{4}-\d{2}-\d{2}$/.test(date) && value
      )
      .map(([date, value]) => ({
        date,
        tab_switches: Math.max(0, Math.floor(Number(value.tab_switches) || 0)),
        active_seconds: Math.max(0, Math.floor(Number(value.active_seconds) || 0)),
        idle_seconds: Math.max(0, Math.floor(Number(value.idle_seconds) || 0)),
      }))

    if (metrics.length) {
      // This endpoint must be implemented in FastAPI in the next step.
      const result = await apiRequest(
        '/api/v1/analytics/metrics/sync',
        token,
        { metrics }
      )

      const now = new Date().toLocaleTimeString()
      elements.lastSync.textContent = `Last synced: ${now}`
      setConnectionStatus(true)

      showStatus(
        `Sync successful. ${entries.length} website records and ${result.saved ?? metrics.length} metric records synced.`,
        'success'
      )
    } else {
      const now = new Date().toLocaleTimeString()
      elements.lastSync.textContent = `Last synced: ${now}`
      setConnectionStatus(true)

      showStatus(
        websiteSynced
          ? 'Website activity synced. No tracking metrics recorded yet.'
          : 'There is no activity to sync yet.',
        websiteSynced ? 'success' : 'error'
      )
    }
  } catch (error) {
    if (error.message === 'AUTH_EXPIRED') {
      await chrome.storage.local.remove([TOKEN_KEY, EMAIL_KEY])
      await showLoggedInView()
      showStatus('Your login has expired. Please log in again.', 'error')
    } else {
      showStatus(
        websiteSynced
          ? `Website activity synced, but metrics sync failed: ${error.message}.`
          : error.message || 'Could not sync activity.',
        'error'
      )
    }
  } finally {
    elements.syncButton.disabled = false
    elements.syncButton.textContent = 'Sync activity'
  }
})

elements.logoutButton.addEventListener('click', async () => {
  await chrome.storage.local.remove([TOKEN_KEY, EMAIL_KEY])
  elements.password.value = ''
  showStatus('Logged out. Local browsing activity has been kept.')
  await showLoggedInView()
})

showLoggedInView()
