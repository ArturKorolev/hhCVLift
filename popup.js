const resumeUrlInput = document.getElementById('resumeUrl');
const startBtn = document.getElementById('startBtn');
const checkBtn = document.getElementById('checkBtn');
const stopBtn = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');

async function setStatus(text) {
  statusEl.textContent = `Статус: ${text}`;
}

async function loadState() {
  const data = await chrome.storage.local.get(['resumeUrl', 'enabled', 'expiresAt']);
  if (data.resumeUrl) resumeUrlInput.value = data.resumeUrl;
  if (data.enabled) {
    const expires = data.expiresAt ? new Date(data.expiresAt).toLocaleString() : 'неизвестно';
    setStatus(`включено, до ${expires}`);
  } else {
    setStatus('выключено');
  }
}

function isUrlValid(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.endsWith('hh.ru') && /(resume\/\d+|resume)/.test(parsed.pathname);
  } catch {
    return false;
  }
}

async function startLifting() {
  const resumeUrl = resumeUrlInput.value.trim();
  if (!resumeUrl || !isUrlValid(resumeUrl)) {
    setStatus('вставьте корректную ссылку на резюме hh.ru');
    return;
  }

  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  await chrome.storage.local.set({ resumeUrl, enabled: true, startedAt: Date.now(), expiresAt });
  await chrome.runtime.sendMessage({ action: 'start', resumeUrl, expiresAt });
  setStatus(`включено, до ${new Date(expiresAt).toLocaleString()}`);
}

async function stopLifting() {
  await chrome.storage.local.set({ enabled: false });
  await chrome.runtime.sendMessage({ action: 'stop' });
  setStatus('выключено');
}

async function checkNow() {
  const resumeUrl = resumeUrlInput.value.trim();
  if (!resumeUrl || !isUrlValid(resumeUrl)) {
    setStatus('вставьте корректную ссылку на резюме hh.ru');
    return;
  }

  await chrome.storage.local.set({ resumeUrl });
  await chrome.runtime.sendMessage({ action: 'liftNow', resumeUrl });
  setStatus('отправлен запрос на проверку сейчас');
}

startBtn.addEventListener('click', startLifting);
checkBtn.addEventListener('click', checkNow);
stopBtn.addEventListener('click', stopLifting);
loadState();
