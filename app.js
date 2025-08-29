const MAX_PERMISSIONS = 10;
const LOCAL_STORAGE_KEY = 'workPermissionsData';

let permissionsUsed = 0;
let historyLog = [];
let currentHijriMonthAndYear = '';
let deferredInstallPrompt = null; // For PWA install prompt

// DOM Elements
const homeScreen = document.getElementById('home-screen');
const historyScreen = document.getElementById('history-screen');
const settingsScreen = document.getElementById('settings-screen');

const navHome = document.getElementById('nav-home');
const navHistory = document.getElementById('nav-history');
const navSettings = document.getElementById('nav-settings');

const currentHijriMonthEl = document.getElementById('current-hijri-month');
const gregorianMonthDetailsEl = document.getElementById('gregorian-month-details');
const workdaysCountEl = document.getElementById('workdays-count');
const permissionsUsedEl = document.getElementById('permissions-used');
const progressBar = document.getElementById('progress-bar');
const permissionsRemainingEl = document.getElementById('permissions-remaining');

const useLateArrivalBtn = document.getElementById('use-late-arrival');
const useEarlyDepartureBtn = document.getElementById('use-early-departure');

const historyList = document.getElementById('history-list');

const appStatusEl = document.getElementById('app-status');
const installSection = document.getElementById('install-section');
const installButton = document.getElementById('install-button');

const confirmationDialog = document.getElementById('confirmation-dialog');
const dialogTitle = document.getElementById('dialog-title');
const dialogMessage = document.getElementById('dialog-message');
const confirmButton = document.getElementById('confirm-button');
const cancelButton = document.getElementById('cancel-button');

let pendingPermissionType = null; // To store which button was pressed

/**
 * Converts a Gregorian Date object to its Um AlQura Hijri representation.
 * @param {Date} date - The Gregorian Date object.
 * @returns {object} An object containing Hijri year, month (1-12), and day.
 */
function getHijriDate(date) {
    // Use ar-SA locale with islamic-umalqura calendar
    // Format options for year, month, day in numeric, and month name in long format.
    const options = {
        calendar: 'islamic-umalqura',
        year: 'numeric',
        month: 'numeric', // Use numeric for easier comparison
        day: 'numeric'
    };
    const formatter = new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura', options);
    const formatted = formatter.format(date); // Example: 1447/8/1
    const [year, month, day] = formatted.split('/').map(Number);

    // For displaying month name
    const monthNameFormatter = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { month: 'long', calendar: 'islamic-umalqura' });
    const hijriMonthName = monthNameFormatter.format(date);

    return {
        year: year,
        month: month, // 1-12
        day: day,
        monthName: hijriMonthName
    };
}

/**
 * Gets the full Hijri month name and year for display.
 * @param {Date} date - The Gregorian Date object.
 * @returns {string} e.g., "Rabi' al-Awwal 1447"
 */
function getFormattedHijriMonthAndYear(date) {
    const options = {
        calendar: 'islamic-umalqura',
        year: 'numeric',
        month: 'long' // Full month name
    };
    const formatter = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', options);
    return formatter.format(date);
}

/**
 * Calculates the Gregorian start and end dates of the current Hijri month,
 * and the number of workdays (excluding Friday & Saturday).
 * @returns {object} { gregorianStartDate, gregorianEndDate, workdays }
 */
function getHijriMonthGregorianRangeAndWorkdays() {
    const today = new Date();
    const { year, month } = getHijriDate(today);

    let gregorianStartDate = new Date(today);
    gregorianStartDate.setHours(0, 0, 0, 0); // Start of day

    // Find the start of the Hijri month (may involve going back a few days)
    while (true) {
        const hijri = getHijriDate(gregorianStartDate);
        if (hijri.year === year && hijri.month === month) {
            // This date is in the current Hijri month, keep going back if it's not the first day
            if (hijri.day === 1) {
                break; // Found the first day of the Hijri month
            }
            gregorianStartDate.setDate(gregorianStartDate.getDate() - 1);
        } else {
            // Went past the start of the month, go forward one day
            gregorianStartDate.setDate(gregorianStartDate.getDate() + 1);
            break;
        }
    }

    let gregorianEndDate = new Date(gregorianStartDate);
    gregorianEndDate.setHours(23, 59, 59, 999); // End of day

    let workdays = 0;
    const tempDate = new Date(gregorianStartDate);

    // Iterate through days to find the end of the Hijri month and count workdays
    while (true) {
        const hijri = getHijriDate(tempDate);
        if (hijri.year === year && hijri.month === month) {
            const dayOfWeek = tempDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
            if (dayOfWeek !== 5 && dayOfWeek !== 6) { // Friday (5) and Saturday (6) are weekends
                workdays++;
            }
            gregorianEndDate = new Date(tempDate); // Keep updating end date
            tempDate.setDate(tempDate.getDate() + 1);
        } else {
            break; // Went past the end of the month
        }
    }

    return {
        gregorianStartDate,
        gregorianEndDate,
        workdays
    };
}

/**
 * Saves the current application state to local storage.
 */
function saveData() {
    const data = {
        permissionsUsed: permissionsUsed,
        historyLog: historyLog,
        currentHijriMonthAndYear: currentHijriMonthAndYear
    };
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
}

/**
 * Loads the application state from local storage.
 */
function loadData() {
    const storedData = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (storedData) {
        const data = JSON.parse(storedData);
        permissionsUsed = data.permissionsUsed || 0;
        historyLog = data.historyLog || [];
        currentHijriMonthAndYear = data.currentHijriMonthAndYear || '';
    }
}

/**
 * Resets permissions and history if a new Hijri month has started.
 */
function checkAndResetMonth() {
    const today = new Date();
    const newHijriMonthAndYear = getFormattedHijriMonthAndYear(today);

    if (newHijriMonthAndYear !== currentHijriMonthAndYear) {
        console.log('New Hijri month detected! Resetting data.');
        permissionsUsed = 0;
        historyLog = [];
        currentHijriMonthAndYear = newHijriMonthAndYear;
        saveData(); // Save reset data
    }
}

/**
 * Updates the UI elements on the home screen.
 */
function updateHomeUI() {
    const today = new Date();
    currentHijriMonthAndYear = getFormattedHijriMonthAndYear(today);
    currentHijriMonthEl.textContent = currentHijriMonthAndYear;

    const { gregorianStartDate, gregorianEndDate, workdays } = getHijriMonthGregorianRangeAndWorkdays();
    const startFormat = gregorianStartDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    const endFormat = gregorianEndDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    gregorianMonthDetailsEl.textContent = `${startFormat} - ${endFormat}`;
    workdaysCountEl.textContent = `${workdays} workdays this month`;

    permissionsUsedEl.textContent = permissionsUsed;
    const remaining = MAX_PERMISSIONS - permissionsUsed;
    permissionsRemainingEl.textContent = remaining;

    const progressPercentage = (permissionsUsed / MAX_PERMISSIONS) * 100;
    progressBar.style.width = `${progressPercentage}%`;

    if (permissionsUsed >= MAX_PERMISSIONS) {
        useLateArrivalBtn.disabled = true;
        useEarlyDepartureBtn.disabled = true;
        useLateArrivalBtn.classList.add('opacity-50', 'cursor-not-allowed');
        useEarlyDepartureBtn.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
        useLateArrivalBtn.disabled = false;
        useEarlyDepartureBtn.disabled = false;
        useLateArrivalBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        useEarlyDepartureBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
}

/**
 * Updates the UI elements on the history screen.
 */
function updateHistoryUI() {
    historyList.innerHTML = ''; // Clear previous entries
    if (historyLog.length === 0) {
        const li = document.createElement('li');
        li.className = 'p-3 text-gray-500 text-center';
        li.textContent = 'No permissions used this month yet.';
        historyList.appendChild(li);
        return;
    }

    // Sort history with newest first
    const sortedHistory = [...historyLog].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    sortedHistory.forEach(entry => {
        const li = document.createElement('li');
        li.className = 'flex justify-between items-center py-3';
        const date = new Date(entry.timestamp);
        const hijri = getHijriDate(date);
        const formattedHijriDate = `${hijri.day} ${hijri.monthName} ${hijri.year} AH`;

        li.innerHTML = `
            <span class="font-medium text-gray-800">${entry.type}</span>
            <span class="text-gray-500 text-sm">${formattedHijriDate}</span>
        `;
        historyList.appendChild(li);
    });
}

/**
 * Shows the confirmation dialog.
 * @param {string} type - 'Late Arrival' or 'Early Departure'.
 */
function showConfirmationDialog(type) {
    pendingPermissionType = type;
    dialogTitle.textContent = `Confirm ${type}`;
    dialogMessage.textContent = `Are you sure you want to log a "${type}" permission? This will use one of your monthly allowances.`;
    confirmationDialog.classList.remove('hidden');
}

/**
 * Hides the confirmation dialog.
 */
function hideConfirmationDialog() {
    confirmationDialog.classList.add('hidden');
    pendingPermissionType = null;
}

/**
 * Logs a permission and updates state.
 * @param {string} type - 'Late Arrival' or 'Early Departure'.
 */
function logPermission(type) {
    if (permissionsUsed < MAX_PERMISSIONS) {
        permissionsUsed++;
        const today = new Date();
        historyLog.push({
            type: type,
            timestamp: today.toISOString(), // ISO string for easy storage and parsing
        });
        saveData();
        updateHomeUI();
        updateHistoryUI(); // Ensure history is also updated
    } else {
        // Optionally show a message that max permissions are reached
        console.warn("Maximum permissions reached!");
    }
    hideConfirmationDialog();
}

/**
 * Switches between different application screens.
 * @param {string} screenId - The ID of the screen to show ('home', 'history', 'settings').
 */
function showScreen(screenId) {
    homeScreen.classList.add('hidden');
    historyScreen.classList.add('hidden');
    settingsScreen.classList.add('hidden');

    document.getElementById(`${screenId}-screen`).classList.remove('hidden');

    // Update active navigation button styling
    [navHome, navHistory, navSettings].forEach(btn => {
        if (btn.id === `nav-${screenId}`) {
            btn.classList.add('text-teal-700', 'font-semibold', 'underline');
            btn.classList.remove('text-gray-600');
        } else {
            btn.classList.remove('text-teal-700', 'font-semibold', 'underline');
            btn.classList.add('text-gray-600');
        }
    });
}

// Event Listeners
navHome.addEventListener('click', () => showScreen('home'));
navHistory.addEventListener('click', () => {
    showScreen('history');
    updateHistoryUI(); // Ensure history is fresh when navigating
});
navSettings.addEventListener('click', () => showScreen('settings'));

useLateArrivalBtn.addEventListener('click', () => showConfirmationDialog('Late Arrival'));
useEarlyDepartureBtn.addEventListener('click', () => showConfirmationDialog('Early Departure'));

confirmButton.addEventListener('click', () => {
    if (pendingPermissionType) {
        logPermission(pendingPermissionType);
    }
});
cancelButton.addEventListener('click', hideConfirmationDialog);

// PWA Installation related
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // Prevent the mini-infobar from appearing on mobile
    deferredInstallPrompt = e; // Stash the event so it can be triggered later.
    installSection.classList.remove('hidden'); // Show install button
    appStatusEl.textContent = 'You can install this app!';
});

installButton.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt(); // Show the install prompt
        const { outcome } = await deferredInstallPrompt.userChoice; // Wait for the user to respond
        console.log(`User response to the install prompt: ${outcome}`);
        deferredInstallPrompt = null; // Clear the prompt
        installSection.classList.add('hidden'); // Hide install button after prompt
        if (outcome === 'accepted') {
            appStatusEl.textContent = 'App installed successfully!';
        } else {
            appStatusEl.textContent = 'App installation declined.';
        }
    }
});

// Detect if the app is installed or running in browser
function getAppStatus() {
    if (navigator.standalone || window.matchMedia('(display-mode: standalone)').matches) {
        appStatusEl.textContent = 'App is installed on your device.';
        installSection.classList.add('hidden'); // Hide install button if installed
    } else {
        appStatusEl.textContent = 'App is running in a standard web browser.';
        // installSection will be shown by beforeinstallprompt if available
    }
}

// Initial app load and setup
function initApp() {
    loadData();
    checkAndResetMonth(); // This will update currentHijriMonthAndYear if reset occurs
    updateHomeUI();
    updateHistoryUI(); // Initial update for history if it's the default view
    getAppStatus();
    showScreen('home'); // Default to home screen on load
}

initApp();

// Service Worker Registration: This should ideally be in script.js to manage the PWA aspect
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('Service Worker registered successfully:', registration);
            })
            .catch(error => {
                console.error('Service Worker registration failed:', error);
            });
    });
}
