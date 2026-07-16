const ALARM_NAME = "hhcvlift-lift";
const DEFAULT_INTERVAL_MINUTES = 241; // 4 часа + 1 минута (лимит hh.ru)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isValidHhResumesUrl(url) {
  try {
    const u = new URL(url);
    const hostOk = u.hostname === "hh.ru" || u.hostname.endsWith(".hh.ru");
    return hostOk && u.pathname.startsWith("/applicant/resumes");
  } catch {
    return false;
  }
}

function getHostnamePattern(url) {
  const u = new URL(url);
  return `*://${u.hostname}/applicant/resumes*`;
}

async function waitForTabComplete(tabId) {
  for (let i = 0; i < 30; i++) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete") return tab;
    await sleep(500);
  }
  return chrome.tabs.get(tabId);
}

async function sendLiftMessage(tabId) {
  for (let i = 0; i < 8; i++) {
    try {
      return await chrome.tabs.sendMessage(tabId, { action: "lift" });
    } catch {
      await sleep(800);
    }
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
  await sleep(500);
  return chrome.tabs.sendMessage(tabId, { action: "lift" });
}

async function openOrReuseTab(profileUrl) {
  const pattern = getHostnamePattern(profileUrl);
  const existing = await chrome.tabs.query({ url: pattern });

  if (existing.length > 0) {
    const tab = existing[0];
    await chrome.tabs.update(tab.id, { url: profileUrl, active: false });
    await waitForTabComplete(tab.id);
    return tab;
  }

  const tab = await chrome.tabs.create({ url: profileUrl, active: false });
  await waitForTabComplete(tab.id);
  return tab;
}

async function scheduleNextLift(whenMs) {
  const when = Math.max(whenMs, Date.now() + 60_000);
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.alarms.create(ALARM_NAME, { when });
}

async function runLift(trigger = "alarm", options = {}) {
  const { force = false } = options;
  const { enabled, profileUrl } = await chrome.storage.local.get(["enabled", "profileUrl"]);
  if (!enabled && !force) return { ok: false, message: "Автопродление выключено" };
  if (!profileUrl || !isValidHhResumesUrl(profileUrl)) {
    return { ok: false, message: "Некорректная ссылка на профиль" };
  }

  let result;
  try {
    const tab = await openOrReuseTab(profileUrl);
    result = await sendLiftMessage(tab.id);
  } catch (err) {
    result = {
      ok: false,
      clicked: 0,
      message: `Ошибка: ${err?.message || err}`,
      nextLiftAt: Date.now() + DEFAULT_INTERVAL_MINUTES * 60_000,
    };
  }

  const nextLiftAt =
    result?.nextLiftAt || Date.now() + DEFAULT_INTERVAL_MINUTES * 60_000;

  await chrome.storage.local.set({
    lastLiftAt: Date.now(),
    lastMessage: result?.message || "Готово",
    lastClicked: result?.clicked ?? 0,
    nextLiftAt,
    lastTrigger: trigger,
  });

  if (enabled) {
    await scheduleNextLift(nextLiftAt);
    updateBadge(true);
  }

  return result;
}

function updateBadge(enabled) {
  chrome.action.setBadgeText({ text: enabled ? "ON" : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#22c55e" });
}

async function startAutoLift(profileUrl) {
  await chrome.storage.local.set({
    enabled: true,
    profileUrl,
  });
  updateBadge(true);
  await runLift("start");
}

async function stopAutoLift() {
  await chrome.storage.local.set({ enabled: false });
  await chrome.alarms.clear(ALARM_NAME);
  updateBadge(false);
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    runLift("alarm");
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message.action === "start") {
      const url = message.profileUrl;
      if (!isValidHhResumesUrl(url)) {
        sendResponse({ ok: false, message: "Укажите ссылку на страницу «Мои резюме»" });
        return;
      }
      await startAutoLift(url);
      sendResponse({ ok: true });
      return;
    }

    if (message.action === "stop") {
      await stopAutoLift();
      sendResponse({ ok: true });
      return;
    }

    if (message.action === "lift-now") {
      if (message.profileUrl) {
        await chrome.storage.local.set({ profileUrl: message.profileUrl });
      }
      const result = await runLift("manual", { force: true });
      sendResponse(result);
      return;
    }

    if (message.action === "get-state") {
      const state = await chrome.storage.local.get([
        "enabled",
        "profileUrl",
        "lastLiftAt",
        "lastMessage",
        "lastClicked",
        "nextLiftAt",
        "lastTrigger",
      ]);
      sendResponse(state);
    }
  })();

  return true;
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.enabled) {
    updateBadge(changes.enabled.newValue === true);
  }
});

chrome.runtime.onStartup.addListener(async () => {
  const { enabled } = await chrome.storage.local.get(["enabled"]);
  updateBadge(enabled === true);
});

chrome.runtime.onInstalled.addListener(async () => {
  const { enabled, profileUrl } = await chrome.storage.local.get(["enabled", "profileUrl"]);
  if (!profileUrl) {
    await chrome.storage.local.set({
      profileUrl: "https://korolev.hh.ru/applicant/resumes",
    });
  }
  updateBadge(enabled === true);
});
