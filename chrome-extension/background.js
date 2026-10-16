
const IDLE_THRESHOLD_SECONDS = 60
const STORAGE_KEY = 'focusflowActivity'
const TRACKING_ALARM = 'focusflowTrackingTick'

let currentTabId = null
let currentDomain = null
let lastStartedAt = null
let isIdle = false

function getDomain(url) {
  if (!url) return null

  try {
    const parsed = new URL(url)

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null
    }

    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

function todayKey() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

async function getStoredActivity() {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  return result[STORAGE_KEY] || {}
}

async function saveElapsedTime() {
  if (!currentDomain || lastStartedAt === null || isIdle) {
    lastStartedAt = null
    return
  }

  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - lastStartedAt) / 1000),
  )

  lastStartedAt = null

  if (elapsedSeconds === 0) return

  const activity = await getStoredActivity()
  const date = todayKey()

  if (!activity[date]) {
    activity[date] = {}
  }

  if (!activity[date][currentDomain]) {
    activity[date][currentDomain] = {
      seconds: 0,
      category: 'uncategorized',
    }
  }

  activity[date][currentDomain].seconds += elapsedSeconds

  await chrome.storage.local.set({
    [STORAGE_KEY]: activity,
  })
}

async function startTracking(tabId, url) {
  await saveElapsedTime()

  currentTabId = tabId
  currentDomain = getDomain(url)

  if (!currentDomain || isIdle) {
    lastStartedAt = null
    return
  }

  lastStartedAt = Date.now()
}

async function syncActiveTab() {
  const state = await chrome.idle.queryState(IDLE_THRESHOLD_SECONDS)
  isIdle = state !== 'active'

  if (isIdle) {
    await saveElapsedTime()
    currentTabId = null
    currentDomain = null
    return
  }

  const tabs = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  })

  const tab = tabs[0]

  if (tab) {
    await startTracking(tab.id, tab.url)
  } else {
    await saveElapsedTime()
    currentTabId = null
    currentDomain = null
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  chrome.idle.setDetectionInterval(IDLE_THRESHOLD_SECONDS)

  await chrome.alarms.create(TRACKING_ALARM, {
    periodInMinutes: 0.5,
  })

  await syncActiveTab()
})

chrome.runtime.onStartup.addListener(async () => {
  chrome.idle.setDetectionInterval(IDLE_THRESHOLD_SECONDS)
  await syncActiveTab()
})

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId)
  await startTracking(tabId, tab.url)
})

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (
    tab.active &&
    changeInfo.url
  ) {
    await startTracking(tabId, changeInfo.url)
  }
})

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await saveElapsedTime()
    currentTabId = null
    currentDomain = null
    return
  }

  await syncActiveTab()
})

chrome.idle.onStateChanged.addListener(async (state) => {
  isIdle = state !== 'active'

  if (isIdle) {
    await saveElapsedTime()
    currentTabId = null
    currentDomain = null
  } else {
    await syncActiveTab()
  }
})

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== TRACKING_ALARM) return

  if (currentTabId !== null && !isIdle) {
    const tab = await chrome.tabs.get(currentTabId).catch(() => null)

    if (!tab || !tab.active) {
      await syncActiveTab()
      return
    }

    await saveElapsedTime()

    if (tab.url && getDomain(tab.url)) {
      currentDomain = getDomain(tab.url)
      lastStartedAt = Date.now()
    }
  } else {
    await syncActiveTab()
  }
})

// Popup can request the latest stored activity.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'GET_ACTIVITY') {
    getStoredActivity()
      .then((activity) => sendResponse({ activity }))
      .catch(() => sendResponse({ activity: {}, error: 'Could not load activity.' }))

    return true
  }

  if (message?.type === 'RESET_ACTIVITY') {
    chrome.storage.local.remove(STORAGE_KEY)
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }))

    return true
  }
})
