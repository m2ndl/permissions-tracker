/*
 * Core logic for the Permissions Tracker PWA.
 * Handles Hijri calendar calculations, state management, UI updates,
 * translation and persistence in localStorage.
 */

(function() {
  'use strict';

  // Hijri date conversion uses the built‑in Intl API with the Umm al‑Qura calendar.
  // We define helper functions to convert between Gregorian and Hijri dates and
  // to determine Hijri month boundaries.

  // Formatter that outputs Hijri dates (day, month, year) according to the
  // islamic‑umalqura calendar. We use English locale for numeric parsing.
  const hijriFormatter = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric'
  });

  // Convert a Gregorian Date object to its Hijri components (year, month, day).
  function toHijri(date) {
    const parts = hijriFormatter.formatToParts(date);
    let day, month, year;
    for (const part of parts) {
      if (part.type === 'day') day = parseInt(part.value, 10);
      if (part.type === 'month') month = parseInt(part.value, 10);
      if (part.type === 'year') year = parseInt(part.value, 10);
    }
    return { year, month, day };
  }

  // Given a Gregorian date, find the Gregorian date corresponding to the first day of its Hijri month.
  function findHijriMonthStart(gregDate) {
    let date = new Date(gregDate);
    let hijri = toHijri(date);
    while (hijri.day > 1) {
      date.setDate(date.getDate() - 1);
      hijri = toHijri(date);
    }
    return date;
  }

  // Given a Gregorian date for the first day of a Hijri month, find the Gregorian date for the last day of that month.
  function findHijriMonthEnd(monthStart, hijriYear, hijriMonth) {
    let date = new Date(monthStart);
    let hijri;
    while (true) {
      const nextDay = new Date(date);
      nextDay.setDate(date.getDate() + 1);
      hijri = toHijri(nextDay);
      if (hijri.year !== hijriYear || hijri.month !== hijriMonth) {
        break;
      }
      date = nextDay;
    }
    return date;
  }

  // DOM references
  const views = {
    home: document.getElementById('home'),
    history: document.getElementById('history'),
    settings: document.getElementById('settings')
  };
  const navButtons = {
    home: document.getElementById('nav-home'),
    history: document.getElementById('nav-history'),
    settings: document.getElementById('nav-settings')
  };
  const monthNameEl = document.getElementById('month-name');
  const workdaysInfoEl = document.getElementById('workdays-info');
  const usedCountEl = document.getElementById('used-count');
  const totalCountEl = document.getElementById('total-count');
  const progressBarEl = document.getElementById('progress');
  const remainingEl = document.getElementById('permissions-remaining');
  const btnLate = document.getElementById('use-permission-late');
  const btnEarly = document.getElementById('use-permission-early');
  const historyListEl = document.getElementById('history-list');
  const languageSelect = document.getElementById('language-select');
  const weekendSelect = document.getElementById('weekend-select');

  // Install app button reference; shown only when the PWA can be installed.
  const installAppBtn = document.getElementById('install-app-btn');
  // Holds the deferred beforeinstallprompt event so we can call prompt() later.
  let deferredPrompt = null;

  // Total permissions allowed per Hijri month
  const TOTAL_PERMISSIONS = 10;

  // Translation strings for UI. Each language object defines the text for the associated keys.
  const translations = {
    en: {
      appTitle: 'Permissions Tracker',
      home: 'Home',
      history: 'History',
      settings: 'Settings',
      monthStarts: (weekday) => `Starts on ${weekday}`,
      monthEnds: (weekday) => `Ends on ${weekday}`,
      workdaysCount: (count) => `${count} workdays this month`,
      remaining: (remaining) => `${remaining} permissions remaining`,
      useLate: 'Use Late Arrival',
      useEarly: 'Use Early Departure',
      historyTitle: 'History',
      historyNoItems: 'No permissions used this month.',
      permissionLate: 'Late arrival',
      permissionEarly: 'Early departure',
      reachedLimit: 'You have used all your permissions for this month.',
      confirmUse: (type) => `Use a permission for ${type}?`,
      languageLabel: 'Language',
      weekendLabel: 'Weekend Days',
      installApp: 'Install App'
    },
    ar: {
      appTitle: 'متتبع الأذونات',
      home: 'الرئيسية',
      history: 'السجل',
      settings: 'الإعدادات',
      monthStarts: (weekday) => `تبدأ في ${weekday}`,
      monthEnds: (weekday) => `تنتهي في ${weekday}`,
      workdaysCount: (count) => `${count} يوم عمل هذا الشهر`,
      remaining: (remaining) => `متبقي ${remaining} إذن`,
      useLate: 'استخدام إذن تأخير',
      useEarly: 'استخدام إذن مبكر',
      historyTitle: 'السجل',
      historyNoItems: 'لا يوجد أذونات مستخدمة هذا الشهر.',
      permissionLate: 'تأخير',
      permissionEarly: 'خروج مبكر',
      reachedLimit: 'لقد استخدمت جميع الأذونات لهذا الشهر.',
      confirmUse: (type) => `هل تريد استخدام إذن لـ ${type}؟`,
      languageLabel: 'اللغة',
      weekendLabel: 'أيام العطلة',
      installApp: 'تثبيت التطبيق'
    }
  };

  // Weekday names in English and Arabic. Index matches Date.getDay() (0 = Sunday, 6 = Saturday).
  const weekdayNames = {
    en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    ar: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
  };

  // Hijri month names for display purposes. Index 1 corresponds to Muharram.
  const hijriMonthNames = {
    en: ['Muharram', 'Safar', 'Rabiʿ I', 'Rabiʿ II', 'Jumada I', 'Jumada II', 'Rajab', 'Shaʿban', 'Ramadan', 'Shawwal', 'Dhu al-Qidah', 'Dhu al-Hijjah'],
    ar: ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة']
  };

  // Application state loaded from localStorage or initialized fresh
  let state = {
    hijriYear: null,
    hijriMonth: null,
    usedPermissions: [], // each item: {date: ISOString, type: 'late'|'early', hijriDate: {year, month, day}}
    settings: {
      language: 'en',
      weekend: [5, 6] // Friday (5) and Saturday (6) as default weekend in Saudi Arabia
    }
  };

  // Cached values for the current Hijri month boundaries. Calculated in init().
  let monthStartDate = null;
  let monthEndDate = null;

  /**
   * Load application state from localStorage. If no state exists or the stored
   * month/year differ from the current Hijri month/year, reset the state.
   */
  function loadState(currentHijriYear, currentHijriMonth) {
    const stored = localStorage.getItem('permissionsData');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.hijriYear === currentHijriYear && parsed.hijriMonth === currentHijriMonth) {
          state = parsed;
        } else {
          // Different month/year -> reset but keep settings
          state = {
            hijriYear: currentHijriYear,
            hijriMonth: currentHijriMonth,
            usedPermissions: [],
            settings: parsed.settings || state.settings
          };
        }
      } catch (err) {
        console.error('Failed to parse stored data', err);
        resetState(currentHijriYear, currentHijriMonth);
      }
    } else {
      resetState(currentHijriYear, currentHijriMonth);
    }
  }

  /** Reset the application state for a new Hijri month. */
  function resetState(currentHijriYear, currentHijriMonth) {
    state = {
      hijriYear: currentHijriYear,
      hijriMonth: currentHijriMonth,
      usedPermissions: [],
      settings: state.settings || { language: 'en', weekend: [5, 6] }
    };
    saveState();
  }

  /** Persist the current application state to localStorage. */
  function saveState() {
    localStorage.setItem('permissionsData', JSON.stringify(state));
  }

  /** Compute the number of days in the current Hijri month. */
  function getHijriMonthLength() {
    if (!monthStartDate || !monthEndDate) return 30;
    const diffMillis = monthEndDate - monthStartDate;
    return Math.round(diffMillis / (1000 * 60 * 60 * 24)) + 1;
  }

  /**
   * Compute the workday statistics for the current Hijri month.
   * Returns an object with number of workdays, and the starting and ending weekdays.
   */
  function calculateWorkdays(year, month, weekendDays, lang) {
    if (!monthStartDate || !monthEndDate) {
      return { workdays: 0, startWeekday: '', endWeekday: '' };
    }
    const startWeekdayIndex = monthStartDate.getDay();
    const endWeekdayIndex = monthEndDate.getDay();
    let workdayCount = 0;
    let current = new Date(monthStartDate);
    while (current <= monthEndDate) {
      const dayIndex = current.getDay();
      if (!weekendDays.includes(dayIndex)) {
        workdayCount++;
      }
      current.setDate(current.getDate() + 1);
    }
    return {
      workdays: workdayCount,
      startWeekday: weekdayNames[lang][startWeekdayIndex],
      endWeekday: weekdayNames[lang][endWeekdayIndex]
    };
  }

  /** Render the home screen: update month info, permissions summary and buttons. */
  function renderHome() {
    const lang = state.settings.language;
    const monthName = hijriMonthNames[lang][state.hijriMonth - 1];
    monthNameEl.textContent = `${monthName} ${state.hijriYear}`;

    // Compute workdays and starting/ending days using selected weekends
    const weekendDays = state.settings.weekend;
    const stats = calculateWorkdays(state.hijriYear, state.hijriMonth, weekendDays, lang);
    workdaysInfoEl.textContent =
      `${translations[lang].monthStarts(stats.startWeekday)} · ` +
      `${translations[lang].monthEnds(stats.endWeekday)} · ` +
      `${translations[lang].workdaysCount(stats.workdays)}`;

    // Permissions count and progress bar
    usedCountEl.textContent = state.usedPermissions.length;
    totalCountEl.textContent = TOTAL_PERMISSIONS;
    const remaining = TOTAL_PERMISSIONS - state.usedPermissions.length;
    remainingEl.textContent = translations[lang].remaining(remaining);
    progressBarEl.style.width =
      `${(state.usedPermissions.length / TOTAL_PERMISSIONS) * 100}%`;

    // Update permission button labels
    btnLate.textContent = translations[lang].useLate;
    btnEarly.textContent = translations[lang].useEarly;

    // Update install app button label according to the current language.
    if (installAppBtn) {
      installAppBtn.textContent = translations[lang].installApp;
    }
  }

  /** Render the history screen by listing used permissions with date and type. */
  function renderHistory() {
    const lang = state.settings.language;
    document.querySelector('#history h2').textContent =
      translations[lang].historyTitle;
    historyListEl.innerHTML = '';
    if (state.usedPermissions.length === 0) {
      const noItem = document.createElement('p');
      noItem.textContent = translations[lang].historyNoItems;
      historyListEl.appendChild(noItem);
      return;
    }
    state.usedPermissions
      .slice()
      .reverse()
      .forEach(item => {
        const li = document.createElement('div');
        li.className = 'history-item';
        const dateDiv = document.createElement('div');
        dateDiv.className = 'date';
        const monthName =
          hijriMonthNames[lang][item.hijriDate.month - 1];
        dateDiv.textContent =
          `${item.hijriDate.day} ${monthName} ${item.hijriDate.year}`;
        const typeDiv = document.createElement('div');
        typeDiv.className = 'type';
        typeDiv.textContent =
          item.type === 'late'
            ? translations[lang].permissionLate
            : translations[lang].permissionEarly;
        li.appendChild(dateDiv);
        li.appendChild(typeDiv);
        historyListEl.appendChild(li);
      });
  }

  /** Render the settings screen by populating form controls. */
  function renderSettings() {
    const lang = state.settings.language;
    // Set selected values
    languageSelect.value = lang;
    weekendSelect.value = state.settings.weekend.join(',');
    // Update labels in settings screen
    document.querySelectorAll('#settings .setting-item label')[0].textContent =
      translations[lang].languageLabel;
    document.querySelectorAll('#settings .setting-item label')[1].textContent =
      translations[lang].weekendLabel;
    // Update nav button text
    navButtons.home.textContent = translations[lang].home;
    navButtons.history.textContent = translations[lang].history;
    navButtons.settings.textContent = translations[lang].settings;
    // Update app title
    document.getElementById('app-title').textContent =
      translations[lang].appTitle;
    // Update the settings page heading
    const settingsHeading = document.querySelector('#settings h2');
    if (settingsHeading) {
      settingsHeading.textContent = translations[lang].settings;
    }
  }

  /** Show one view and hide the others. Activate the corresponding nav button. */
  function navigateTo(viewName) {
    Object.keys(views).forEach(key => {
      views[key].classList.add('hidden');
    });
    views[viewName].classList.remove('hidden');
    Object.keys(navButtons).forEach(key => {
      navButtons[key].classList.remove('active');
    });
    navButtons[viewName].classList.add('active');
    // Render view-specific content
    if (viewName === 'home') {
      renderHome();
    } else if (viewName === 'history') {
      renderHistory();
    } else if (viewName === 'settings') {
      renderSettings();
    }
  }

  /** Handle using a permission by deducting from remaining count. */
  function usePermission(type) {
    const lang = state.settings.language;
    if (state.usedPermissions.length >= TOTAL_PERMISSIONS) {
      alert(translations[lang].reachedLimit);
      return;
    }
    if (
      !confirm(
        translations[lang].confirmUse(
          type === 'late'
            ? translations[lang].permissionLate
            : translations[lang].permissionEarly
        )
      )
    ) {
      return;
    }
    const now = new Date();
    const hijriNow = toHijri(now);
    const newEntry = {
      date: now.toISOString(),
      type,
      hijriDate: {
        year: hijriNow.year,
        month: hijriNow.month,
        day: hijriNow.day
      }
    };
    state.usedPermissions.push(newEntry);
    saveState();
    renderHome();
  }

  /** Initialise the application. */
  function init() {
    const todayHijri = toHijri(new Date());
    const currentHijriYear = todayHijri.year;
    const currentHijriMonth = todayHijri.month;
    loadState(currentHijriYear, currentHijriMonth);

    // Compute month boundaries
    monthStartDate = findHijriMonthStart(new Date());
    monthEndDate = findHijriMonthEnd(
      monthStartDate,
      currentHijriYear,
      currentHijriMonth
    );

    // Attach event listeners for navigation
    navButtons.home.addEventListener('click', () => navigateTo('home'));
    navButtons.history.addEventListener('click', () => navigateTo('history'));
    navButtons.settings.addEventListener('click', () => navigateTo('settings'));

    // Attach event listeners for using permissions
    btnLate.addEventListener('click', () => usePermission('late'));
    btnEarly.addEventListener('click', () => usePermission('early'));

    // Language change
    languageSelect.addEventListener('change', () => {
      state.settings.language = languageSelect.value;
      saveState();
      renderHome();
      renderHistory();
      renderSettings();
    });

    // Weekend change
    weekendSelect.addEventListener('change', () => {
      const values = weekendSelect.value
        .split(',')
        .map(num => parseInt(num, 10));
      state.settings.weekend = values;
      saveState();
      renderHome();
    });

    // Handle PWA installation prompt. The beforeinstallprompt event is fired
    // when the browser determines the app is installable. Save the event and
    // show our custom install button. When the user installs the app,
    // hide the button again.
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      deferredPrompt = e;
      if (installAppBtn) {
        installAppBtn.classList.remove('hidden');
      }
    });
    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      if (installAppBtn) {
        installAppBtn.classList.add('hidden');
      }
    });
    if (installAppBtn) {
      installAppBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        try {
          await deferredPrompt.userChoice;
        } finally {
          deferredPrompt = null;
          installAppBtn.classList.add('hidden');
        }
      });
    }

    // Initial rendering of all screens
    renderSettings();
    renderHome();
    // Show home by default
    navigateTo('home');
  }

  // Wait until the DOM is fully loaded, then initialise
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
