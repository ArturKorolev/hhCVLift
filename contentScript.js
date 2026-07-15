function getLiftButton() {
  const textSelectors = ['поднять', 'поднять резюме', 'обновить', 'обновить резюме', 'опубликовать', 'опубликовать резюме', 'обновить в поиске', 'поднять в поиске'];
  const elements = Array.from(document.querySelectorAll('button, a, input[type="button"], input[type="submit"], input[type="image"]'));

  const getElementText = (el) => {
    return [el.innerText, el.value, el.getAttribute('aria-label'), el.getAttribute('title')]
      .filter(Boolean)
      .join(' ')
      .trim()
      .toLowerCase();
  };

  for (const el of elements) {
    const text = getElementText(el);
    if (!text) continue;
    if (textSelectors.some((candidate) => text.includes(candidate))) {
      return el;
    }
  }

  const attributeSelectors = [
    '[data-qa*="resume"]',
    '[data-qa*="publish"]',
    '[data-qa*="raise"]',
    '[data-qa*="update"]',
    '[aria-label*="поднять"]',
    '[aria-label*="обновить"]',
    '[aria-label*="опубликовать"]',
    '[title*="поднять"]',
    '[title*="обновить"]',
    '[title*="опубликовать"]'
  ];

  for (const selector of attributeSelectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }

  return null;
}

function isResumePage(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.endsWith('hh.ru') && /^\/resume(?:\/\d+)?\/?$/.test(parsed.pathname);
  } catch {
    return false;
  }
}

function navigateToResume(resumeUrl) {
  if (window.location.href !== resumeUrl) {
    window.location.href = resumeUrl;
  }
}

async function liftResume(resumeUrl) {
  if (!isResumePage(window.location.href)) {
    navigateToResume(resumeUrl);
    return;
  }

  const button = getLiftButton();
  if (!button) {
    console.warn('HH Resume Lifter: кнопка не найдена');
    return;
  }

  button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'liftResume') {
    liftResume(message.resumeUrl);
    sendResponse({ ok: true });
  }
});
