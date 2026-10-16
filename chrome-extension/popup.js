
const API_BASE_URL = 'http://127.0.0.1:8000'
const TOKEN_KEY = 'focusflowToken'
const EMAIL_KEY = 'focusflowEmail'
const ACTIVITY_KEY = 'focusflowActivity'

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
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function formatDuration(seconds) {
  const totalSeconds = Math.max(0, Math.floor(seconds || 0))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainingSeconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`
  }

  return `${remainingSeconds}s`
}

async function getLocalActivity() {
  const result = await chrome.storage.local.get(ACTIVITY_KEY)
  return result[ACTIVITY_KEY] || {}
}

function renderActivity(activity) {
  const today = activity[getTodayKey()] || {}

  const sites = Object.entries(today)
    .filter(([domain, entry]) => {
      return (
        domain &&
        domain !== 'null' &&
        entry &&
        Number.isFinite(Number(entry.seconds))
      )
    })
    .map(([domain, entry]) => ({
      domain,
      seconds: Math.max(0, Number(entry.seconds)),
    }))
    .sort((a, b) => b.seconds - a.seconds)

  const totalSeconds = sites.reduce(
    (total, site) => total + site.seconds,
    0,
  )

  elements.totalTime.textContent = formatDuration(totalSeconds)
  elements.siteCount.textContent =
    `${sites.length} website${sites.length === 1 ? '' : 's'} tracked`

  elements.activityList.replaceChildren()

  if (sites.length === 0) {
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
  const response = await chrome.runtime.sendMessage({
    type: 'GET_ACTIVITY',
  })

  if (response?.error) {
    throw new Error(response.error)
  }

  renderActivity(response?.activity || {})
}

async function showLoggedInView() {
  const stored = await chrome.storage.local.get([
    TOKEN_KEY,
    EMAIL_KEY,
  ])

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
      headers: {
        'Content-Type': 'application/json',
      },
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

    if (!token) {
      throw new Error(
        'Login response did not contain a token. Check the backend login response format.',
      )
    }

    const accountEmail =
      data.user?.email ||
      data.email ||
      email

    await chrome.storage.local.set({
      [TOKEN_KEY]: token,
      [EMAIL_KEY]: accountEmail,
    })

    elements.password.value = ''

    await showLoggedInView()
    showStatus('Successfully logged in.', 'success')
  } catch (error) {
    setConnectionStatus(false)
    showStatus(
      error.message || 'Could not connect to the FocusFlow backend.',
      'error',
    )
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
  showStatus('Syncing website activity...')

  try {
    const stored = await chrome.storage.local.get(TOKEN_KEY)
    const token = stored[TOKEN_KEY]

    if (!token) {
      throw new Error('Please log in before syncing activity.')
    }

    const activity = await getLocalActivity()
    const entries = []

    for (const [date, domains] of Object.entries(activity)) {
      for (const [domain, details] of Object.entries(domains || {})) {
        if (
          !domain ||
          domain === 'null' ||
          !details ||
          !Number.isFinite(Number(details.seconds))
        ) {
          continue
        }

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

    if (entries.length === 0) {
      showStatus('There is no website activity to sync yet.', 'error')
      return
    }

    const response = await fetch(`${API_BASE_URL}/api/activity/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ entries }),
    })

    const data = await response.json().catch(() => ({}))

    if (response.status === 401 || response.status === 403) {
      await chrome.storage.local.remove([TOKEN_KEY, EMAIL_KEY])
      setConnectionStatus(false)
      await showLoggedInView()
      throw new Error('Your login has expired. Please log in again.')
    }

    if (!response.ok) {
      const detail = Array.isArray(data.detail)
        ? data.detail.map((item) => item.msg).join(', ')
        : data.detail

      throw new Error(detail || `Sync failed (${response.status}).`)
    }

    const now = new Date().toLocaleTimeString()
    elements.lastSync.textContent = `Last synced: ${now}`
    setConnectionStatus(true)

    showStatus(
      `Sync successful. ${data.saved ?? entries.length} activity records saved.`,
      'success',
    )
  } catch (error) {
    showStatus(error.message || 'Could not sync activity.', 'error')
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
