const profileUrlInput = document.getElementById("profileUrl");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const liftNowBtn = document.getElementById("liftNowBtn");
const statusText = document.getElementById("statusText");
const lastLiftText = document.getElementById("lastLiftText");
const nextLiftText = document.getElementById("nextLiftText");
const messageText = document.getElementById("messageText");

function formatDateTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function setMessage(text) {
  messageText.textContent = text || "";
}

async function loadState() {
  const state = await chrome.runtime.sendMessage({ action: "get-state" });
  profileUrlInput.value = state.profileUrl || "";
  renderState(state);
}

function renderState(state) {
  const enabled = state.enabled === true;

  statusText.textContent = enabled ? "Активно" : "Остановлено";
  statusText.className = `value ${enabled ? "active" : "stopped"}`;

  startBtn.disabled = enabled;
  stopBtn.disabled = !enabled;
  profileUrlInput.disabled = enabled;

  lastLiftText.textContent = formatDateTime(state.lastLiftAt);
  nextLiftText.textContent = enabled ? formatDateTime(state.nextLiftAt) : "—";

  if (state.lastMessage) {
    const clicked =
      typeof state.lastClicked === "number" && state.lastClicked > 0
        ? ` (${state.lastClicked} резюме)`
        : "";
    setMessage(`${state.lastMessage}${clicked}`);
  }
}

startBtn.addEventListener("click", async () => {
  const profileUrl = profileUrlInput.value.trim();
  setMessage("Запускаем...");

  const response = await chrome.runtime.sendMessage({
    action: "start",
    profileUrl,
  });

  if (!response?.ok) {
    setMessage(response?.message || "Не удалось запустить");
    return;
  }

  await loadState();
  setMessage("Автопродление запущено. Первая попытка выполняется...");
});

stopBtn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ action: "stop" });
  await loadState();
  setMessage("Автопродление остановлено");
});

liftNowBtn.addEventListener("click", async () => {
  const profileUrl = profileUrlInput.value.trim();
  if (!profileUrl) {
    setMessage("Укажите ссылку на страницу резюме");
    return;
  }

  setMessage("Пробуем поднять резюме...");

  const result = await chrome.runtime.sendMessage({
    action: "lift-now",
    profileUrl,
  });
  await loadState();

  if (result?.message) {
    setMessage(result.message);
  }
});

loadState();
