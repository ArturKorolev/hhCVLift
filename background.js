const CHECK_INTERVAL_MINUTES = 241; // hh.ru позволяет обновлять резюме примерно каждые 4 часа и 1 минуту

async function getState() {
  return chrome.storage.local.get(['resumeUrl', 'enabled', 'expiresAt']);
}

async function scheduleAlarm() {
  await chrome.alarms.clear('lift-check');
  await chrome.alarms.create('lift-check', { periodInMinutes: CHECK_INTERVAL_MINUTES });
}

async function stopAlarm() {
  await chrome.alarms.clear('lift-check');
}

function notify(title, message) {
  if (!chrome.notifications) return;
  chrome.notifications.create('', {
    type: 'basic',
    iconUrl: 'icon128.png',
    title,
    message
  });
}

async function openOrReuseTab(resumeUrl) {
  const tabs = await chrome.tabs.query({ url: ['*://hh.ru/*', '*://*.hh.ru/*'] });
  const existingResumeTab = tabs.find((tab) => tab.url && tab.url.startsWith(resumeUrl));
  if (existingResumeTab) return existingResumeTab;

  const createdTab = await chrome.tabs.create({ url: resumeUrl, active: false });
  return new Promise((resolve) => {
    const onUpdated = (tabId, changeInfo, tab) => {
      if (tabId !== createdTab.id) return;
      if (changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve(tab);
      }
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

async function performLift({ resumeUrl: overrideUrl, force = false } = {}) {
  const state = await getState();
  const resumeUrl = overrideUrl || state.resumeUrl;
  if (!resumeUrl) return;
  if (!force && state.expiresAt && Date.now() > state.expiresAt) {
    await chrome.storage.local.set({ enabled: false });
    notify('HH Resume Lifter', 'Автоподнятие завершено — 7 дней истекли.');
    return;
  }

  const tab = await openOrReuseTab(resumeUrl);
  if (!tab || !tab.id) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['contentScript.js']
    });
    await chrome.tabs.sendMessage(tab.id, { action: 'liftResume', resumeUrl: state.resumeUrl });
  } catch (error) {
    console.error('HH Resume Lifter error:', error);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await scheduleAlarm();
});

chrome.runtime.onStartup.addListener(async () => {
  await scheduleAlarm();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'lift-check') return;
  await performLift();
});

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === 'start') {
    await scheduleAlarm();
    await performLift({ force: true });
    sendResponse({ ok: true });
  }
  if (message.action === 'stop') {
    await chrome.storage.local.set({ enabled: false });
    sendResponse({ ok: true });
  }
  if (message.action === 'liftNow') {
    if (message.resumeUrl) {
      await chrome.storage.local.set({ resumeUrl: message.resumeUrl });
    }
    await performLift({ resumeUrl: message.resumeUrl, force: true });
    sendResponse({ ok: true });
  }
});
