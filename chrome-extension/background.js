
const IDLE_THRESHOLD_SECONDS = 60;
const STORAGE_KEY = "focusflowActivity";
const METRICS_KEY = "focusflowMetrics";
const TRACKING_ALARM = "focusflowTrackingTick";

let currentTabId = null;
let currentDomain = null;
let lastStartedAt = null;
let isIdle = false;
let lastActivityDate = null;

function getDomain(url) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

async function getStored(key) {
  const result = await chrome.storage.local.get(key);
  return result[key] || {};
}

async function updateMetrics(callback) {
  const metrics = await getStored(METRICS_KEY);
  const date = todayKey();

  if (!metrics[date]) {
    metrics[date] = {
      tab_switches: 0,
      active_seconds: 0,
      idle_seconds: 0,
      last_updated: new Date().toISOString()
    };
  }

  callback(metrics[date]);
  metrics[date].last_updated = new Date().toISOString();

  await chrome.storage.local.set({ [METRICS_KEY]: metrics });
}

async function recordTabSwitch() {
  await updateMetrics((day) => {
    day.tab_switches += 1;
  });
}

async function recordElapsedTime() {
  if (lastStartedAt === null) return;

  const elapsed = Math.max(
    0,
    Math.floor((Date.now() - lastStartedAt) / 1000)
  );

  lastStartedAt = Date.now();

  if (elapsed === 0) return;

  if (isIdle) {
    await updateMetrics((day) => {
      day.idle_seconds += elapsed;
    });
    return;
  }

  await updateMetrics((day) => {
    day.active_seconds += elapsed;
  });

  if (!currentDomain) return;

  const activity = await getStored(STORAGE_KEY);
  const date = todayKey();

  if (!activity[date]) activity[date] = {};

  if (!activity[date][currentDomain]) {
    activity[date][currentDomain] = {
      seconds: 0,
      category: "uncategorized"
    };
  }

  activity[date][currentDomain].seconds += elapsed;

  await chrome.storage.local.set({
    [STORAGE_KEY]: activity
  });
}

async function startTracking(tabId, url, countSwitch = false) {
  await recordElapsedTime();

  if (
    countSwitch &&
    currentTabId !== null &&
    currentTabId !== tabId
  ) {
    await recordTabSwitch();
  }

  currentTabId = tabId;
  currentDomain = getDomain(url);
  lastStartedAt = Date.now();

  if (isIdle || !currentDomain) {
    lastStartedAt = null;
  }
}

async function syncActiveTab() {
  const state = await chrome.idle.queryState(IDLE_THRESHOLD_SECONDS);
  isIdle = state !== "active";

  if (isIdle) {
    await recordElapsedTime();
    currentTabId = null;
    currentDomain = null;
    lastStartedAt = Date.now();
    return;
  }

  const tabs = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true
  });

  const tab = tabs[0];

  if (tab) {
    await startTracking(tab.id, tab.url);
  } else {
    await recordElapsedTime();
    currentTabId = null;
    currentDomain = null;
    lastStartedAt = null;
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  chrome.idle.setDetectionInterval(IDLE_THRESHOLD_SECONDS);

  await chrome.alarms.create(TRACKING_ALARM, {
    periodInMinutes: 0.5
  });

  await syncActiveTab();
});

chrome.runtime.onStartup.addListener(async () => {
  chrome.idle.setDetectionInterval(IDLE_THRESHOLD_SECONDS);
  await syncActiveTab();
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId).catch(() => null);

  if (tab) {
    await startTracking(tabId, tab.url, true);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tab.active && (changeInfo.url || changeInfo.status === "complete")) {
    await startTracking(tabId, tab.url);
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await recordElapsedTime();
    currentTabId = null;
    currentDomain = null;
    lastStartedAt = null;
    return;
  }

  await syncActiveTab();
});

chrome.idle.onStateChanged.addListener(async (state) => {
  await recordElapsedTime();

  isIdle = state !== "active";

  if (isIdle) {
    currentTabId = null;
    currentDomain = null;
    lastStartedAt = Date.now();
  } else {
    await syncActiveTab();
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== TRACKING_ALARM) return;

  if (currentTabId !== null) {
    const tab = await chrome.tabs.get(currentTabId).catch(() => null);

    if (!tab || !tab.active) {
      await syncActiveTab();
      return;
    }
  }

  await recordElapsedTime();

  if (currentTabId !== null && !isIdle && currentDomain) {
    lastStartedAt = Date.now();
  } else {
    await syncActiveTab();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GET_ACTIVITY") {
    Promise.all([
      getStored(STORAGE_KEY),
      getStored(METRICS_KEY)
    ])
      .then(([activity, metrics]) => {
        sendResponse({ activity, metrics });
      })
      .catch(() => {
        sendResponse({
          activity: {},
          metrics: {},
          error: "Could not load tracking data."
        });
      });

    return true;
  }

  if (message?.type === "RESET_ACTIVITY") {
    chrome.storage.local.remove([STORAGE_KEY, METRICS_KEY])
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }));

    return true;
  }
});
