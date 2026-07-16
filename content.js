(function () {
  "use strict";

  const LIFT_TEXTS = ["Поднять в поиске", "Поднять"];

  function normalizeText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function isVisible(el) {
    if (!el || el.disabled) return false;
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function isLiftLabel(text) {
    const t = normalizeText(text);
    return LIFT_TEXTS.some((label) => t === label || t.startsWith(label));
  }

  function findLiftButtons() {
    const found = new Set();

    const candidates = document.querySelectorAll(
      'a, button, [role="button"], .bloko-link, [data-qa*="publish"], [data-qa*="resume-update"]',
    );

    for (const el of candidates) {
      const text = normalizeText(el.innerText || el.textContent);
      if (!isLiftLabel(text)) continue;
      if (!isVisible(el)) continue;
      found.add(el);
    }

    return [...found];
  }

  function parseNextLiftTime() {
    const blocks = document.querySelectorAll(
      '.applicant-resumes-action, [class*="resume"], [data-qa*="resume"]',
    );

    for (const block of blocks) {
      const text = normalizeText(block.innerText || block.textContent);
      if (!text.includes("Поднять") && !text.includes("поднять")) continue;
      if (!text.includes("вручную") && !text.includes("сможете") && !text.includes("через")) continue;

      const parsed = parseRussianDateTime(text);
      if (parsed) return parsed;
    }

    return null;
  }

  function parseRussianDateTime(text) {
    const now = new Date();

    const todayMatch = text.match(
      /(\d{1,2}):(\d{2})\s*(?:\(|\s)?сегодня|сегодня[^\d]*(\d{1,2}):(\d{2})/i,
    );
    if (todayMatch) {
      const hours = Number(todayMatch[1] || todayMatch[3]);
      const minutes = Number(todayMatch[2] || todayMatch[4]);
      const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);
      if (dt.getTime() <= now.getTime()) dt.setDate(dt.getDate() + 1);
      return dt.getTime();
    }

    const months = {
      января: 0,
      февраля: 1,
      марта: 2,
      апреля: 3,
      мая: 4,
      июня: 5,
      июля: 6,
      августа: 7,
      сентября: 8,
      октября: 9,
      ноября: 10,
      декабря: 11,
    };

    const fullMatch = text.match(
      /(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+(\d{4}))?[^\d]*(\d{1,2}):(\d{2})/i,
    );
    if (fullMatch) {
      const day = Number(fullMatch[1]);
      const month = months[fullMatch[2].toLowerCase()];
      const year = fullMatch[3] ? Number(fullMatch[3]) : now.getFullYear();
      const hours = Number(fullMatch[4]);
      const minutes = Number(fullMatch[5]);
      return new Date(year, month, day, hours, minutes, 0).getTime();
    }

    const inHours = text.match(/через\s+(\d+)\s*ч/);
    if (inHours) {
      return now.getTime() + Number(inHours[1]) * 60 * 60 * 1000;
    }

    const inMinutes = text.match(/через\s+(\d+)\s*мин/);
    if (inMinutes) {
      return now.getTime() + Number(inMinutes[1]) * 60 * 1000;
    }

    return null;
  }

  function clickLiftButtons() {
    const buttons = findLiftButtons();
    let clicked = 0;

    for (const btn of buttons) {
      btn.click();
      clicked += 1;
    }

    const nextLiftAt = parseNextLiftTime();
    const defaultNext = Date.now() + 4 * 60 * 60 * 1000 + 60 * 1000;

    if (clicked > 0) {
      return {
        ok: true,
        clicked,
        message: `Поднято резюме: ${clicked}`,
        nextLiftAt: nextLiftAt || defaultNext,
      };
    }

    if (nextLiftAt && nextLiftAt > Date.now()) {
      return {
        ok: true,
        clicked: 0,
        skipped: true,
        message: "Рано поднимать — ждём следующего окна",
        nextLiftAt,
      };
    }

    return {
      ok: false,
      clicked: 0,
      message: "Кнопка «Поднять» не найдена. Откройте страницу «Мои резюме» и войдите в аккаунт.",
      nextLiftAt: defaultNext,
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.action !== "lift") return;

    const waitForDom = () => {
      const result = clickLiftButtons();
      if (result.clicked === 0 && result.ok === false) {
        setTimeout(() => {
          const retry = clickLiftButtons();
          sendResponse(retry.clicked > 0 || retry.skipped ? retry : result);
        }, 2000);
        return true;
      }
      sendResponse(result);
    };

    if (document.readyState === "complete") {
      waitForDom();
    } else {
      window.addEventListener("load", waitForDom, { once: true });
    }

    return true;
  });
})();
