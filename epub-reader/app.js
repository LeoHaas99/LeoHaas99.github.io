const PREFS_KEY = "epub-reader:prefs:v1";
const POSITION_PREFIX = "epub-reader:position:";
const RECENT_BOOKS_KEY = "epub-reader:recent:v1";
const RECENT_BOOKS_LIMIT = 5;
const SEARCH_RESULT_LIMIT = 250;
const SEARCH_DEBOUNCE_MS = 350;
const HANDLE_DATABASE_NAME = "epub-reader-files-v1";
const HANDLE_STORE_NAME = "book-handles";
const FONT_MIN = 80;
const FONT_MAX = 600;
const FONT_STEP = 10;
const READER_WIDTH_MIN = 10;
const READER_WIDTH_MAX = 100;
const READER_WIDTH_STEP = 10;
const LOCATION_BREAK_SIZE = 1600;
const OPEN_TIMEOUT_MS = 15000;
const CONTENT_THEME_STYLE_ID = "epub-reader-content-theme";

const elements = {
  app: document.querySelector("#app"),
  landing: document.querySelector("#landing"),
  reader: document.querySelector("#reader"),
  viewer: document.querySelector("#viewer"),
  progressBar: document.querySelector("#progress-bar"),
  fileInput: document.querySelector("#file-input"),
  openBook: document.querySelector("#open-book"),
  landingOpenBook: document.querySelector("#landing-open-book"),
  landingStatus: document.querySelector("#landing-status"),
  loadingOverlay: document.querySelector("#loading-overlay"),
  loadingLabel: document.querySelector("#loading-label"),
  notice: document.querySelector("#notice"),
  bookTitle: document.querySelector("#book-title"),
  chapterTitle: document.querySelector("#chapter-title"),
  previousPage: document.querySelector("#previous-page"),
  nextPage: document.querySelector("#next-page"),
  tocToggle: document.querySelector("#toc-toggle"),
  tocPanel: document.querySelector("#toc-panel"),
  tocBackdrop: document.querySelector("#toc-backdrop"),
  tocClose: document.querySelector("#toc-close"),
  tocList: document.querySelector("#toc-list"),
  recentMenu: document.querySelector("#recent-menu"),
  recentToggle: document.querySelector("#recent-toggle"),
  recentPanel: document.querySelector("#recent-panel"),
  recentList: document.querySelector("#recent-list"),
  searchMenu: document.querySelector("#search-menu"),
  searchToggle: document.querySelector("#search-toggle"),
  searchPanel: document.querySelector("#search-panel"),
  searchForm: document.querySelector("#search-form"),
  searchInput: document.querySelector("#search-input"),
  searchClose: document.querySelector("#search-close"),
  searchStatus: document.querySelector("#search-status"),
  searchResults: document.querySelector("#search-results"),
  fontDecrease: document.querySelector("#font-decrease"),
  fontIncrease: document.querySelector("#font-increase"),
  fontSize: document.querySelector("#font-size"),
  widthDecrease: document.querySelector("#width-decrease"),
  widthIncrease: document.querySelector("#width-increase"),
  readerWidth: document.querySelector("#reader-width"),
  themeToggle: document.querySelector("#theme-toggle"),
  fullscreenToggle: document.querySelector("#fullscreen-toggle"),
  progress: document.querySelector("#progress"),
  progressValue: document.querySelector("#progress-value"),
  locationLabel: document.querySelector("#location-label"),
  chapterStats: document.querySelector("#chapter-stats"),
  bookStats: document.querySelector("#book-stats"),
  dropOverlay: document.querySelector("#drop-overlay"),
};

const storageAvailableAtStart = detectStorage();
const initialPreferences = loadPreferences(storageAvailableAtStart);
const initialRecentBooks = loadRecentBooks(storageAvailableAtStart);

const state = {
  book: null,
  rendition: null,
  fingerprint: null,
  metadata: null,
  displayTitle: "",
  fileName: "",
  hasFileHandle: false,
  tocEntries: [],
  recentBooks: initialRecentBooks,
  recentHandles: new Map(),
  searchResults: [],
  searchVersion: 0,
  searching: false,
  locationsPromise: null,
  currentLocation: null,
  currentChapter: "",
  locationsReady: false,
  atStart: true,
  atEnd: false,
  busy: false,
  storageAvailable: storageAvailableAtStart,
  fingerprintAvailable: true,
  persistenceWarning: storageAvailableAtStart
    ? ""
    : "Reading works, but this browser is blocking local storage, so positions and preferences cannot be saved.",
  theme: initialPreferences.theme,
  fontSize: initialPreferences.fontSize,
  readerWidth: initialPreferences.readerWidth,
  navigationQueue: Promise.resolve(),
  noticeVersion: 0,
};

class ReaderError extends Error {}

let handleDatabasePromise = null;

function detectStorage() {
  try {
    const testKey = "epub-reader:storage-test";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

function loadPreferences(canUseStorage) {
  const defaults = { theme: "light", fontSize: 100, readerWidth: 100 };

  if (!canUseStorage) return defaults;

  try {
    const saved = JSON.parse(window.localStorage.getItem(PREFS_KEY) || "null");
    const theme = saved?.theme === "dark" ? "dark" : "light";
    const savedFontSize = Number(saved?.fontSize);
    const fontSize = Number.isFinite(savedFontSize)
      ? clamp(Math.round(savedFontSize / FONT_STEP) * FONT_STEP, FONT_MIN, FONT_MAX)
      : defaults.fontSize;
    const savedReaderWidth = Number(saved?.readerWidth);
    const readerWidth = Number.isFinite(savedReaderWidth)
      ? clamp(
          Math.round(savedReaderWidth / READER_WIDTH_STEP) * READER_WIDTH_STEP,
          READER_WIDTH_MIN,
          READER_WIDTH_MAX,
        )
      : defaults.readerWidth;

    return { theme, fontSize, readerWidth };
  } catch {
    return defaults;
  }
}

function loadRecentBooks(canUseStorage) {
  if (!canUseStorage) return [];

  try {
    const saved = JSON.parse(window.localStorage.getItem(RECENT_BOOKS_KEY) || "[]");
    if (!Array.isArray(saved)) return [];

    return saved
      .filter(
        (record) =>
          record &&
          typeof record.fingerprint === "string" &&
          /^[a-f\d]{64}$/i.test(record.fingerprint) &&
          typeof record.title === "string" &&
          record.title.trim(),
      )
      .slice(0, RECENT_BOOKS_LIMIT)
      .map((record) => ({
        fingerprint: record.fingerprint,
        title: record.title.trim(),
        fileName: typeof record.fileName === "string" ? record.fileName : "",
        percentage: Number.isFinite(record.percentage)
          ? clamp(record.percentage, 0, 1)
          : null,
        updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
        hasHandle: Boolean(record.hasHandle),
      }));
  } catch {
    return [];
  }
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function withTimeout(promise, milliseconds, message) {
  let timer = 0;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new ReaderError(message)), milliseconds);
  });

  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

function openHandleDatabase() {
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("IndexedDB is unavailable."));
  }
  if (handleDatabasePromise) return handleDatabasePromise;

  handleDatabasePromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(HANDLE_DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(HANDLE_STORE_NAME)) {
        request.result.createObjectStore(HANDLE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open file-handle storage."));
  });

  handleDatabasePromise.catch(() => {
    handleDatabasePromise = null;
  });
  return handleDatabasePromise;
}

async function readStoredFileHandle(fingerprint) {
  try {
    const database = await openHandleDatabase();
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(HANDLE_STORE_NAME, "readonly");
      const request = transaction.objectStore(HANDLE_STORE_NAME).get(fingerprint);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn("Could not read a saved file handle.", error);
    return null;
  }
}

async function storeFileHandle(fingerprint, handle) {
  if (!fingerprint || !handle || handle.kind !== "file") return false;

  try {
    const database = await openHandleDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(HANDLE_STORE_NAME, "readwrite");
      transaction.objectStore(HANDLE_STORE_NAME).put(handle, fingerprint);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    state.recentHandles.set(fingerprint, handle);
    return true;
  } catch (error) {
    console.warn("Could not save a file handle for direct reopening.", error);
    return false;
  }
}

async function hydrateRecentHandles() {
  let changed = false;
  await Promise.all(
    state.recentBooks.map(async (record) => {
      if (!record.hasHandle) return;
      const handle = await readStoredFileHandle(record.fingerprint);
      if (handle?.kind === "file") {
        state.recentHandles.set(record.fingerprint, handle);
      } else {
        record.hasHandle = false;
        changed = true;
      }
    }),
  );
  if (changed) saveRecentBooks();
  renderRecentBooks();
}

function showNotice(message, kind = "info", autoHideAfter = 0) {
  state.noticeVersion += 1;
  const version = state.noticeVersion;
  elements.notice.textContent = message;
  elements.notice.dataset.kind = kind;
  elements.notice.hidden = false;

  if (autoHideAfter > 0) {
    window.setTimeout(() => {
      if (state.noticeVersion !== version) return;
      restoreBaselineNotice();
    }, autoHideAfter);
  }
}

function restoreBaselineNotice() {
  state.noticeVersion += 1;

  if (state.persistenceWarning) {
    elements.notice.textContent = state.persistenceWarning;
    elements.notice.dataset.kind = "warning";
    elements.notice.hidden = false;
    return;
  }

  elements.notice.hidden = true;
  elements.notice.textContent = "";
  delete elements.notice.dataset.kind;
}

function markPersistenceUnavailable() {
  if (!state.storageAvailable && state.persistenceWarning) return;

  state.storageAvailable = false;
  state.persistenceWarning =
    "Reading works, but this browser is blocking local storage, so positions and preferences cannot be saved.";

  if (elements.notice.dataset.kind !== "error") {
    restoreBaselineNotice();
  }
}

function markFingerprintUnavailable() {
  state.fingerprintAvailable = false;
  state.persistenceWarning =
    "This browser cannot identify EPUB files securely, so book positions cannot be restored. Display preferences can still be saved.";

  if (elements.notice.dataset.kind !== "error") {
    restoreBaselineNotice();
  }
}

function savePreferences() {
  if (!state.storageAvailable) return;

  try {
    window.localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({
        theme: state.theme,
        fontSize: state.fontSize,
        readerWidth: state.readerWidth,
      }),
    );
  } catch {
    markPersistenceUnavailable();
  }
}

function saveRecentBooks() {
  if (!state.storageAvailable) return;

  try {
    window.localStorage.setItem(RECENT_BOOKS_KEY, JSON.stringify(state.recentBooks));
  } catch {
    markPersistenceUnavailable();
  }
}

function renderRecentBooks() {
  elements.recentList.replaceChildren();

  for (const record of state.recentBooks) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    const title = document.createElement("span");
    const detail = document.createElement("span");
    const percentage = Number.isFinite(record.percentage)
      ? `${Math.round(record.percentage * 100)}% read`
      : "Position saved";
    const canReopen = record.hasHandle && state.recentHandles.has(record.fingerprint);

    button.type = "button";
    button.className = "recent-book-button";
    button.title = record.title;
    button.setAttribute(
      "aria-label",
      canReopen ? `Open ${record.title}` : `Select ${record.title} from your device`,
    );
    title.className = "recent-book-title";
    title.textContent = record.title;
    detail.className = "recent-book-detail";
    detail.textContent = `${percentage} · ${canReopen ? "Ready to open" : record.fileName || "Reselect file"}`;

    button.append(title, detail);
    button.addEventListener("click", () => void openRecentBook(record));
    item.append(button);
    elements.recentList.append(item);
  }

  elements.recentToggle.disabled = state.busy || state.recentBooks.length === 0;
}

function rememberCurrentBook(percentage = null, updatedAt = new Date().toISOString()) {
  if (!state.fingerprint || !state.displayTitle) return;

  const existing = state.recentBooks.find(
    (record) => record.fingerprint === state.fingerprint,
  );
  const recentBook = {
    fingerprint: state.fingerprint,
    title: state.displayTitle,
    fileName: state.fileName,
    percentage: Number.isFinite(percentage)
      ? clamp(percentage, 0, 1)
      : existing?.percentage ?? null,
    updatedAt,
    hasHandle: state.hasFileHandle || existing?.hasHandle || false,
  };

  state.recentBooks = [
    recentBook,
    ...state.recentBooks.filter((record) => record.fingerprint !== state.fingerprint),
  ].slice(0, RECENT_BOOKS_LIMIT);

  saveRecentBooks();
  renderRecentBooks();
}

function readSavedPosition(fingerprint) {
  if (!state.storageAvailable || !fingerprint) return null;

  try {
    const record = JSON.parse(
      window.localStorage.getItem(`${POSITION_PREFIX}${fingerprint}`) || "null",
    );

    if (!record || typeof record.cfi !== "string" || !record.cfi.startsWith("epubcfi(")) {
      return null;
    }

    return record;
  } catch {
    markPersistenceUnavailable();
    return null;
  }
}

function saveCurrentPosition(cfi, percentage) {
  if (!state.fingerprint || !cfi) return;

  const updatedAt = new Date().toISOString();

  if (state.storageAvailable) {
    try {
      window.localStorage.setItem(
        `${POSITION_PREFIX}${state.fingerprint}`,
        JSON.stringify({
          cfi,
          percentage: Number.isFinite(percentage) ? percentage : null,
          updatedAt,
        }),
      );
    } catch {
      markPersistenceUnavailable();
    }
  }

  rememberCurrentBook(percentage, updatedAt);
}

async function fingerprintBuffer(buffer) {
  if (!window.crypto?.subtle) {
    throw new Error("Web Crypto is unavailable.");
  }

  const digest = await window.crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function applyDocumentTheme() {
  document.documentElement.dataset.theme = state.theme;
  const isDark = state.theme === "dark";
  elements.themeToggle.setAttribute("aria-pressed", `${isDark}`);
  elements.themeToggle.setAttribute("aria-label", isDark ? "Use light theme" : "Use dark theme");
}

function contentThemeCss(theme) {
  const colors =
    theme === "dark"
      ? {
          background: "#202224",
          foreground: "#e8e6df",
          link: "#9bc8db",
          border: "#5a5d60",
          selection: "#365d73",
        }
      : {
          background: "#fffefa",
          foreground: "#262624",
          link: "#245d7a",
          border: "#c8c6be",
          selection: "#c9e1ec",
        };

  return `
    :root,
    body {
      background-color: ${colors.background} !important;
      color: ${colors.foreground} !important;
    }

    body,
    body * {
      color: ${colors.foreground} !important;
      -webkit-text-fill-color: ${colors.foreground} !important;
    }

    body * {
      background-color: transparent !important;
      border-color: ${colors.border} !important;
    }

    body a,
    body a * {
      color: ${colors.link} !important;
      -webkit-text-fill-color: ${colors.link} !important;
    }

    ::selection {
      background-color: ${colors.selection} !important;
      color: ${colors.foreground} !important;
      -webkit-text-fill-color: ${colors.foreground} !important;
    }
  `;
}

function applyThemeToContents(contents, theme = state.theme) {
  const contentDocument = contents?.document;
  if (!contentDocument?.head) return;

  let style = contentDocument.getElementById(CONTENT_THEME_STYLE_ID);
  if (!style) {
    style = contentDocument.createElement("style");
    style.id = CONTENT_THEME_STYLE_ID;
    contentDocument.head.append(style);
  }

  style.textContent = contentThemeCss(theme);
  contentDocument.documentElement.style.colorScheme = theme;
}

function applyRenditionTheme(rendition = state.rendition) {
  if (!rendition) return;

  for (const contents of rendition.getContents()) {
    applyThemeToContents(contents);
  }
}

function applyRenditionAppearance(rendition = state.rendition) {
  if (!rendition) return;

  applyRenditionTheme(rendition);
  rendition.themes.fontSize(`${state.fontSize}%`);
}

function syncAppearanceControls() {
  elements.fontSize.value = `${state.fontSize}%`;
  elements.fontSize.textContent = `${state.fontSize}%`;
  elements.readerWidth.value = `${state.readerWidth}%`;
  elements.readerWidth.textContent = `${state.readerWidth}%`;
  elements.app.style.setProperty("--reader-width", `${state.readerWidth}%`);
  applyDocumentTheme();
  updateControlStates();
}

function setTheme(theme) {
  state.theme = theme === "dark" ? "dark" : "light";
  applyDocumentTheme();

  if (state.rendition) {
    applyRenditionTheme(state.rendition);
  }

  savePreferences();
}

function changeFontSize(direction) {
  if (!state.rendition || state.busy) return;

  state.fontSize = clamp(state.fontSize + direction * FONT_STEP, FONT_MIN, FONT_MAX);
  state.rendition.themes.fontSize(`${state.fontSize}%`);
  savePreferences();
  syncAppearanceControls();
}

function changeReaderWidth(direction) {
  if (!state.rendition || state.busy) return;

  state.readerWidth = clamp(
    state.readerWidth + direction * READER_WIDTH_STEP,
    READER_WIDTH_MIN,
    READER_WIDTH_MAX,
  );
  savePreferences();
  syncAppearanceControls();

  const rendition = state.rendition;
  window.requestAnimationFrame(() => {
    if (state.rendition !== rendition) return;
    rendition.resize();
    rendition.reportLocation();
  });
}

function updateControlStates() {
  const hasBook = Boolean(state.rendition);
  elements.openBook.disabled = state.busy;
  elements.landingOpenBook.disabled = state.busy;
  elements.fileInput.disabled = state.busy;
  elements.recentToggle.disabled = state.busy || state.recentBooks.length === 0;
  elements.searchToggle.disabled = state.busy || !hasBook;
  elements.searchInput.disabled = state.busy || !hasBook;
  elements.tocToggle.disabled = state.busy || !hasBook || state.tocEntries.length === 0;
  elements.previousPage.disabled = state.busy || !hasBook || state.atStart;
  elements.nextPage.disabled = state.busy || !hasBook || state.atEnd;
  elements.fontDecrease.disabled = state.busy || !hasBook || state.fontSize <= FONT_MIN;
  elements.fontIncrease.disabled = state.busy || !hasBook || state.fontSize >= FONT_MAX;
  elements.widthDecrease.disabled =
    state.busy || !hasBook || state.readerWidth <= READER_WIDTH_MIN;
  elements.widthIncrease.disabled =
    state.busy || !hasBook || state.readerWidth >= READER_WIDTH_MAX;
  elements.progress.disabled = state.busy || !hasBook || !state.locationsReady;
  elements.fullscreenToggle.disabled = state.busy || !hasBook || !document.fullscreenEnabled;
}

function setBusy(isBusy, label = "Opening book…") {
  state.busy = isBusy;
  elements.app.setAttribute("aria-busy", `${isBusy}`);
  elements.loadingLabel.textContent = label;
  elements.loadingOverlay.hidden = !(isBusy && state.book);
  elements.landingStatus.textContent = isBusy
    ? label
    : state.persistenceWarning || "Your position will return when you select the same file again.";
  updateControlStates();
}

async function promptForFile() {
  if (state.busy) return;
  closeRecentBooks(false);

  if (typeof window.showOpenFilePicker === "function" && window.isSecureContext) {
    try {
      const [handle] = await window.showOpenFilePicker({
        id: "epub-reader-books",
        multiple: false,
        types: [
          {
            description: "EPUB and Kobo EPUB books",
            accept: {
              "application/epub+zip": [".epub", ".kepub", ".epu"],
            },
          },
        ],
      });
      if (!handle) return;
      const file = await handle.getFile();
      await openFile(file, handle);
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
      console.warn("The persistent file picker was unavailable.", error);
      showNotice("Direct file access is unavailable here. Use the standard file picker instead.", "warning", 4500);
    }
  }

  elements.fileInput.value = "";
  elements.fileInput.click();
}

async function openRecentBook(record) {
  if (state.busy) return;
  closeRecentBooks(false);

  const handle =
    state.recentHandles.get(record.fingerprint) ||
    (record.hasHandle ? await readStoredFileHandle(record.fingerprint) : null);

  if (!handle?.getFile) {
    showNotice(`Select “${record.title}” again to restore its saved position.`, "info", 5000);
    await promptForFile();
    return;
  }

  state.recentHandles.set(record.fingerprint, handle);

  try {
    let permission =
      typeof handle.queryPermission === "function"
        ? await handle.queryPermission({ mode: "read" })
        : "prompt";
    if (permission !== "granted" && typeof handle.requestPermission === "function") {
      permission = await handle.requestPermission({ mode: "read" });
    }
    if (permission === "denied") {
      showNotice("Permission to reopen that book was not granted.", "warning", 4500);
      return;
    }

    const file = await handle.getFile();
    await openFile(file, handle);
  } catch (error) {
    console.warn("Could not reopen the recent book.", error);
    showNotice("That recent file was moved, deleted, or is no longer accessible.", "error");
  }
}

function validateFile(file) {
  if (!file) throw new ReaderError("No file was selected.");
  if (file.size === 0) throw new ReaderError("That EPUB file is empty.");

  const hasSupportedExtension = /\.(?:epub|kepub|epu)$/i.test(file.name);
  const hasEpubMimeType = ["application/epub+zip", "application/x-kobo-epub+zip"].includes(
    file.type,
  );

  if (!hasSupportedExtension && !hasEpubMimeType) {
    throw new ReaderError("Please choose an EPUB or Kobo EPUB file.");
  }
}

function createCandidateViewer() {
  const viewer = document.createElement("div");
  viewer.id = "viewer";
  viewer.className = "viewer";
  viewer.setAttribute("aria-label", "EPUB content");
  return viewer;
}

function destroyBook(book, rendition) {
  try {
    rendition?.destroy();
  } catch (error) {
    console.warn("Could not fully destroy the previous rendition.", error);
  }

  try {
    book?.destroy();
  } catch (error) {
    console.warn("Could not fully destroy the previous book.", error);
  }
}

function registerRenditionHandlers(rendition) {
  rendition.hooks.content.register((contents) => {
    const contentDocument = contents?.document;
    if (!contentDocument) return;

    applyThemeToContents(contents);

    contentDocument.addEventListener("keydown", handleReaderKeydown);
    contentDocument.addEventListener("dragenter", handleDragEnter);
    contentDocument.addEventListener("dragover", handleDragOver);
    contentDocument.addEventListener("dragleave", handleDragLeave);
    contentDocument.addEventListener("drop", handleDrop);
  });

  rendition.on("relocated", (location) => {
    if (state.rendition === rendition) handleRelocated(location);
  });
}

async function openFile(file, fileHandle = null) {
  if (state.busy) {
    showNotice("Please wait for the current book to finish opening.", "warning", 3000);
    return;
  }

  let candidateBook = null;
  let candidateRendition = null;
  let candidateViewer = null;
  let previousViewer = null;

  try {
    validateFile(file);
    state.searchVersion += 1;
    state.searching = false;
    closeSearch(false);
    restoreBaselineNotice();
    setBusy(true, `Opening ${file.name}…`);

    const buffer = await file.arrayBuffer();
    let fingerprint = null;

    try {
      fingerprint = await fingerprintBuffer(buffer);
    } catch (error) {
      console.warn("Could not fingerprint this EPUB.", error);
      markFingerprintUnavailable();
    }

    candidateBook = window.ePub(buffer, {
      openAs: "binary",
      replacements: "blobUrl",
    });

    await withTimeout(
      candidateBook.opened,
      OPEN_TIMEOUT_MS,
      "This EPUB took too long to open and may be damaged or unsupported.",
    );
    await withTimeout(
      candidateBook.ready,
      OPEN_TIMEOUT_MS,
      "This EPUB took too long to prepare and may be damaged or unsupported.",
    );

    const [metadata, navigation] = await Promise.all([
      candidateBook.loaded.metadata.catch(() => ({})),
      candidateBook.loaded.navigation.catch(() => ({ toc: [] })),
    ]);
    const savedPosition = readSavedPosition(fingerprint);

    previousViewer = elements.viewer;
    candidateViewer = createCandidateViewer();
    previousViewer.removeAttribute("id");
    previousViewer.replaceWith(candidateViewer);
    elements.viewer = candidateViewer;
    elements.landing.hidden = true;
    elements.reader.hidden = false;
    elements.progressBar.hidden = false;
    elements.loadingOverlay.hidden = false;
    await nextFrame();

    candidateRendition = candidateBook.renderTo(candidateViewer, {
      width: "100%",
      height: "100%",
      flow: "paginated",
      spread: "none",
      manager: "default",
      allowScriptedContent: false,
    });
    candidateRendition.spread("none");
    registerRenditionHandlers(candidateRendition);
    applyRenditionAppearance(candidateRendition);

    let restoredPosition = false;
    if (savedPosition?.cfi) {
      try {
        await candidateRendition.display(savedPosition.cfi);
        restoredPosition = true;
      } catch (error) {
        console.warn("The saved EPUB position was invalid; opening at the beginning.", error);
        await candidateRendition.display();
      }
    } else {
      await candidateRendition.display();
    }

    const hasFileHandle = fileHandle
      ? await storeFileHandle(fingerprint, fileHandle)
      : state.recentHandles.has(fingerprint);

    promoteCandidate({
      book: candidateBook,
      rendition: candidateRendition,
      fingerprint,
      metadata,
      navigation,
      file,
      hasFileHandle,
    });

    candidateBook = null;
    candidateRendition = null;
    candidateViewer = null;
    previousViewer = null;

    await nextFrame();
    try {
      state.rendition.resize();
      state.rendition.reportLocation();
    } catch (error) {
      console.warn("The reader could not immediately resize the new rendition.", error);
    }
    setBusy(false);

    if (state.persistenceWarning) {
      restoreBaselineNotice();
    } else if (restoredPosition) {
      showNotice("Restored your saved reading position.", "info", 3500);
    } else {
      restoreBaselineNotice();
    }

    state.locationsPromise = prepareLocations(state.book, state.rendition);
    void state.locationsPromise;
  } catch (error) {
    console.error("Could not open EPUB.", error);
    destroyBook(candidateBook, candidateRendition);

    if (candidateViewer && previousViewer && elements.viewer === candidateViewer) {
      candidateViewer.removeAttribute("id");
      previousViewer.id = "viewer";
      candidateViewer.replaceWith(previousViewer);
      elements.viewer = previousViewer;

      if (state.book) {
        elements.landing.hidden = true;
        elements.reader.hidden = false;
        elements.progressBar.hidden = false;
        window.setTimeout(() => {
          state.rendition?.resize();
          state.rendition?.reportLocation();
        }, 0);
      } else {
        elements.landing.hidden = false;
        elements.reader.hidden = true;
        elements.progressBar.hidden = true;
      }
    }

    setBusy(false);

    const message =
      error instanceof ReaderError
        ? error.message
        : "This file could not be opened as an EPUB. It may be damaged, unsupported, or DRM-protected.";
    showNotice(message, "error");
  }
}

function promoteCandidate({
  book,
  rendition,
  fingerprint,
  metadata,
  navigation,
  file,
  hasFileHandle,
}) {
  const previousBook = state.book;
  const previousRendition = state.rendition;

  state.book = book;
  state.rendition = rendition;
  state.fingerprint = fingerprint;
  state.metadata = metadata || {};
  state.fileName = file.name;
  state.hasFileHandle = hasFileHandle;
  state.locationsReady = false;
  state.currentLocation = null;
  state.currentChapter = "";
  state.searchVersion += 1;
  state.searching = false;
  state.searchResults = [];
  state.locationsPromise = null;
  state.atStart = false;
  state.atEnd = false;
  state.navigationQueue = Promise.resolve();

  const displayTitle =
    `${metadata?.title || ""}`.trim() ||
    file.name.replace(/(?:\.kepub)?\.epub$|\.kepub$|\.epu$/i, "");
  state.displayTitle = displayTitle;
  elements.bookTitle.textContent = displayTitle;
  elements.chapterTitle.textContent = "Finding your place…";

  renderTableOfContents(navigation?.toc || []);
  closeTableOfContents(false);
  elements.landing.hidden = true;
  elements.reader.hidden = false;
  elements.progressBar.hidden = false;
  elements.progress.value = "0";
  elements.progressValue.value = "—%";
  elements.progressValue.textContent = "—%";
  elements.locationLabel.textContent = "Calculating reading progress…";
  elements.chapterStats.textContent = "Chapter —";
  elements.bookStats.textContent = "Book —";
  elements.searchInput.value = "";
  elements.searchStatus.textContent = "Enter at least two characters.";
  elements.searchResults.removeAttribute("aria-busy");
  renderSearchResults();
  rememberCurrentBook();
  syncAppearanceControls();
  updateControlStates();

  destroyBook(previousBook, previousRendition);
}

async function prepareLocations(book, rendition) {
  try {
    await book.locations.generate(LOCATION_BREAK_SIZE);
    if (state.book !== book || state.rendition !== rendition) return;

    state.locationsReady = true;
    const location = await Promise.resolve(rendition.currentLocation());
    if (location) handleRelocated(location);
    updateControlStates();
  } catch (error) {
    if (state.book !== book) return;
    console.warn("Could not calculate EPUB locations.", error);
    state.locationsReady = false;
    elements.locationLabel.textContent = state.currentChapter || "Reading";
    elements.bookStats.textContent = "Book pages unavailable";
    updateControlStates();
    showNotice("The book is open, but its progress slider could not be calculated.", "warning", 4000);
  }
}

function renderTableOfContents(items) {
  elements.tocList.replaceChildren();
  state.tocEntries = [];

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "toc-link";
    empty.textContent = "This EPUB does not include a table of contents.";
    elements.tocList.append(empty);
    updateControlStates();
    return;
  }

  const appendItems = (tocItems, parent) => {
    const list = document.createElement("ul");

    for (const item of tocItems) {
      const listItem = document.createElement("li");
      const label = `${item.label || "Untitled section"}`.trim();

      if (item.href) {
        const button = document.createElement("button");
        button.className = "toc-link";
        button.type = "button";
        button.textContent = label;
        button.addEventListener("click", () => {
          const rendition = state.rendition;
          if (!rendition || state.busy) return;
          closeTableOfContents(false);
          rendition.display(item.href).catch((error) => {
            console.error("Could not open this chapter.", error);
            showNotice("That chapter could not be opened.", "error");
          });
        });
        listItem.append(button);
        state.tocEntries.push({ href: item.href, label, button });
      } else {
        const text = document.createElement("span");
        text.className = "toc-link";
        text.textContent = label;
        listItem.append(text);
      }

      if (Array.isArray(item.subitems) && item.subitems.length) {
        appendItems(item.subitems, listItem);
      }

      list.append(listItem);
    }

    parent.append(list);
  };

  appendItems(items, elements.tocList);
  updateControlStates();
}

function chapterLabelForHref(href, sectionIndex) {
  const sectionHref = normalizeHref(href);
  const entry = state.tocEntries.find((candidate) => {
    const candidateHref = normalizeHref(candidate.href);
    return (
      candidateHref === sectionHref ||
      (candidateHref && sectionHref && sectionHref.endsWith(`/${candidateHref}`)) ||
      (candidateHref && sectionHref && candidateHref.endsWith(`/${sectionHref}`))
    );
  });

  return entry?.label || `Section ${sectionIndex + 1}`;
}

function renderSearchResults() {
  elements.searchResults.replaceChildren();

  for (const result of state.searchResults) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    const chapter = document.createElement("span");
    const excerpt = document.createElement("span");

    button.type = "button";
    button.className = "search-result-button";
    button.setAttribute("aria-label", `Open search result in ${result.chapter}`);
    chapter.className = "search-result-chapter";
    chapter.textContent = result.chapter;
    excerpt.className = "search-result-excerpt";
    excerpt.textContent = result.excerpt;

    button.append(chapter, excerpt);
    button.addEventListener("click", async () => {
      const rendition = state.rendition;
      if (!rendition || state.busy) return;
      closeSearch(false);
      try {
        await rendition.display(result.cfi);
      } catch (error) {
        console.error("Could not open the search result.", error);
        showNotice("That search result could not be opened.", "error");
      }
    });
    item.append(button);
    elements.searchResults.append(item);
  }
}

async function performSearch(rawQuery) {
  const query = `${rawQuery || ""}`.trim().replace(/\s+/g, " ");
  const version = ++state.searchVersion;
  const book = state.book;

  if (query.length < 2) {
    state.searching = false;
    state.searchResults = [];
    renderSearchResults();
    elements.searchStatus.textContent = "Enter at least two characters.";
    elements.searchResults.removeAttribute("aria-busy");
    return;
  }
  if (!book) return;

  state.searching = true;
  state.searchResults = [];
  renderSearchResults();
  elements.searchResults.setAttribute("aria-busy", "true");
  elements.searchStatus.textContent = "Preparing book search…";

  try {
    if (state.locationsPromise) await state.locationsPromise.catch(() => undefined);
    if (version !== state.searchVersion || state.book !== book) return;

    const sections = Array.from(book.spine?.spineItems || []);
    const request = book.load.bind(book);
    const seenCfis = new Set();
    let reachedLimit = false;

    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
      if (version !== state.searchVersion || state.book !== book) return;

      const section = sections[sectionIndex];
      elements.searchStatus.textContent = `Searching ${sectionIndex + 1} of ${sections.length}… ${state.searchResults.length} found`;

      try {
        await section.load(request);
        if (version !== state.searchVersion || state.book !== book) return;

        const matches = [...section.find(query), ...section.search(query)];
        const chapter = chapterLabelForHref(section.href, sectionIndex);

        for (const match of matches) {
          if (!match?.cfi || seenCfis.has(match.cfi)) continue;
          seenCfis.add(match.cfi);
          state.searchResults.push({
            cfi: match.cfi,
            chapter,
            excerpt: `${match.excerpt || query}`.replace(/\s+/g, " ").trim(),
          });
          if (state.searchResults.length >= SEARCH_RESULT_LIMIT) {
            reachedLimit = true;
            break;
          }
        }
      } catch (error) {
        console.warn(`Could not search EPUB section ${sectionIndex + 1}.`, error);
      } finally {
        section.unload();
      }

      renderSearchResults();
      if (reachedLimit) break;
    }

    if (version !== state.searchVersion || state.book !== book) return;
    elements.searchStatus.textContent = reachedLimit
      ? `Showing the first ${SEARCH_RESULT_LIMIT} matches.`
      : state.searchResults.length === 1
        ? "1 match found."
        : `${state.searchResults.length} matches found.`;
  } catch (error) {
    if (version !== state.searchVersion) return;
    console.error("Could not search this EPUB.", error);
    elements.searchStatus.textContent = "This book could not be searched.";
  } finally {
    if (version === state.searchVersion) {
      state.searching = false;
      elements.searchResults.removeAttribute("aria-busy");
    }
  }
}

function normalizeHref(href) {
  const withoutFragment = `${href || ""}`.split("#")[0].replace(/^\.\//, "");

  try {
    return decodeURIComponent(withoutFragment);
  } catch {
    return withoutFragment;
  }
}

function updateActiveChapter(href) {
  const currentHref = normalizeHref(href);
  let activeEntry = null;

  for (const entry of state.tocEntries) {
    const entryHref = normalizeHref(entry.href);
    const isMatch =
      entryHref === currentHref ||
      (entryHref && currentHref && currentHref.endsWith(`/${entryHref}`)) ||
      (entryHref && currentHref && entryHref.endsWith(`/${currentHref}`));

    entry.button.removeAttribute("aria-current");
    if (!activeEntry && isMatch) activeEntry = entry;
  }

  if (activeEntry) {
    activeEntry.button.setAttribute("aria-current", "location");
    state.currentChapter = activeEntry.label;
    elements.chapterTitle.textContent = activeEntry.label;
  } else {
    state.currentChapter = "";
    elements.chapterTitle.textContent = "Reading";
  }
}

function handleRelocated(location) {
  if (!location?.start) return;

  state.currentLocation = location;
  state.atStart = Boolean(location.atStart);
  state.atEnd = Boolean(location.atEnd);
  updateActiveChapter(location.start.href);

  let percentage = null;
  if (state.locationsReady && state.book?.locations && location.start.cfi) {
    try {
      percentage = state.book.locations.percentageFromCfi(location.start.cfi);
    } catch (error) {
      console.warn("Could not calculate the current percentage.", error);
    }
  }

  const displayed = location.start.displayed;
  const chapterPage = Number(displayed?.page);
  const chapterTotal = Number(displayed?.total);
  const hasChapterPages =
    Number.isFinite(chapterPage) &&
    Number.isFinite(chapterTotal) &&
    chapterPage > 0 &&
    chapterTotal > 0;
  const percentageValue = Number.isFinite(percentage)
    ? clamp(percentage * 100, 0, 100)
    : null;
  const roundedBookPercentage = Number.isFinite(percentageValue)
    ? Math.round(percentageValue)
    : null;

  elements.locationLabel.textContent = state.currentChapter || "Reading";
  elements.chapterStats.textContent = hasChapterPages
    ? `Chapter ${chapterPage}/${chapterTotal}`
    : "Chapter —";

  let bookPage = null;
  let bookTotal = null;
  if (state.locationsReady && state.book?.locations) {
    try {
      bookTotal = Number(state.book.locations.length());
      const reportedLocation = Number(location.start.location);
      if (Number.isFinite(reportedLocation)) {
        bookPage = reportedLocation + 1;
      } else if (Number.isFinite(percentage) && Number.isFinite(bookTotal)) {
        bookPage = Math.floor(percentage * Math.max(bookTotal - 1, 0)) + 1;
      }
    } catch (error) {
      console.warn("Could not calculate the full-book page count.", error);
    }
  }

  const hasBookPages =
    Number.isFinite(bookPage) && Number.isFinite(bookTotal) && bookTotal > 0;
  elements.bookStats.textContent = hasBookPages
    ? `Book ${clamp(bookPage, 1, bookTotal)}/${bookTotal}${
        Number.isFinite(roundedBookPercentage) ? ` · ${roundedBookPercentage}%` : ""
      }`
    : state.locationsReady
      ? "Book pages unavailable"
      : "Book pages calculating…";

  if (Number.isFinite(percentage)) {
    elements.progress.value = percentageValue.toFixed(1);
    elements.progressValue.value = `${roundedBookPercentage}%`;
    elements.progressValue.textContent = `${roundedBookPercentage}%`;
    elements.progress.setAttribute("aria-valuetext", `${roundedBookPercentage}% read`);
  }

  saveCurrentPosition(location.start.cfi, percentage);
  updateControlStates();
}

function enqueueNavigation(direction) {
  const rendition = state.rendition;
  if (!rendition || state.busy) return;
  if (direction === "prev" && state.atStart) return;
  if (direction === "next" && state.atEnd) return;

  state.navigationQueue = state.navigationQueue
    .catch(() => undefined)
    .then(() => {
      if (state.rendition !== rendition) return undefined;
      return direction === "prev" ? rendition.prev() : rendition.next();
    })
    .catch((error) => {
      console.error("Could not change pages.", error);
      showNotice("The reader could not change pages.", "error");
    });
}

function isInteractiveTarget(target) {
  if (!target || target.nodeType !== Node.ELEMENT_NODE) return false;
  if (target.isContentEditable) return true;
  return Boolean(
    target.closest?.(
      "a, button, input, select, textarea, summary, [role='button'], [contenteditable='true']",
    ),
  );
}

function handleReaderKeydown(event) {
  if (!state.rendition || state.busy || event.defaultPrevented) return;
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  if (isInteractiveTarget(event.target)) return;

  if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    event.preventDefault();
    enqueueNavigation("prev");
    return;
  }

  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    event.preventDefault();
    enqueueNavigation("next");
    return;
  }

  if (event.code === "Space" || event.key === " " || event.key === "Spacebar") {
    event.preventDefault();
    enqueueNavigation(event.shiftKey ? "prev" : "next");
  }
}

function toggleRecentBooks() {
  if (elements.recentToggle.disabled) return;
  if (elements.recentPanel.hidden) {
    closeSearch(false);
    closeTableOfContents(false);
    elements.recentPanel.hidden = false;
    elements.recentToggle.setAttribute("aria-expanded", "true");
  } else {
    closeRecentBooks();
  }
}

function closeRecentBooks(restoreFocus = true) {
  const wasOpen = !elements.recentPanel.hidden;
  elements.recentPanel.hidden = true;
  elements.recentToggle.setAttribute("aria-expanded", "false");
  if (wasOpen && restoreFocus) elements.recentToggle.focus();
}

function toggleSearch() {
  if (elements.searchToggle.disabled) return;
  if (elements.searchPanel.hidden) {
    closeRecentBooks(false);
    closeTableOfContents(false);
    elements.searchPanel.hidden = false;
    elements.searchToggle.setAttribute("aria-expanded", "true");
    window.requestAnimationFrame(() => {
      elements.searchInput.focus();
      elements.searchInput.select();
    });
  } else {
    closeSearch();
  }
}

function closeSearch(restoreFocus = true) {
  const wasOpen = !elements.searchPanel.hidden;
  elements.searchPanel.hidden = true;
  elements.searchToggle.setAttribute("aria-expanded", "false");
  if (state.searching) {
    state.searchVersion += 1;
    state.searching = false;
    elements.searchResults.removeAttribute("aria-busy");
  }
  if (wasOpen && restoreFocus) elements.searchToggle.focus();
}

function openTableOfContents() {
  if (elements.tocToggle.disabled) return;
  closeRecentBooks(false);
  closeSearch(false);
  elements.tocPanel.classList.add("is-open");
  elements.tocPanel.setAttribute("aria-hidden", "false");
  elements.tocBackdrop.hidden = false;
  elements.tocToggle.setAttribute("aria-expanded", "true");
  elements.tocClose.focus();
}

function closeTableOfContents(restoreFocus = true) {
  const wasOpen = elements.tocPanel.classList.contains("is-open");
  elements.tocPanel.classList.remove("is-open");
  elements.tocPanel.setAttribute("aria-hidden", "true");
  elements.tocBackdrop.hidden = true;
  elements.tocToggle.setAttribute("aria-expanded", "false");

  if (wasOpen && restoreFocus) elements.tocToggle.focus();
}

async function seekToProgress() {
  if (!state.locationsReady || !state.book || !state.rendition || state.busy) return;

  try {
    const percentage = clamp(Number(elements.progress.value) / 100, 0, 1);
    const cfi = state.book.locations.cfiFromPercentage(percentage);
    if (cfi) await state.rendition.display(cfi);
  } catch (error) {
    console.error("Could not seek through the EPUB.", error);
    showNotice("The reader could not move to that position.", "error");
  }
}

function previewProgress() {
  const percentage = Math.round(Number(elements.progress.value));
  elements.progressValue.value = `${percentage}%`;
  elements.progressValue.textContent = `${percentage}%`;
}

async function toggleFullscreen() {
  if (!state.rendition || !document.fullscreenEnabled) return;

  try {
    if (document.fullscreenElement === elements.app) {
      await document.exitFullscreen();
    } else {
      await elements.app.requestFullscreen();
    }
  } catch (error) {
    console.error("Could not change fullscreen mode.", error);
    showNotice("Fullscreen mode is unavailable in this browser.", "warning", 3500);
  }
}

function updateFullscreenControl() {
  const isFullscreen = document.fullscreenElement === elements.app;
  elements.fullscreenToggle.setAttribute("aria-pressed", `${isFullscreen}`);
  elements.fullscreenToggle.setAttribute(
    "aria-label",
    isFullscreen ? "Exit fullscreen" : "Enter fullscreen",
  );

  window.setTimeout(() => state.rendition?.resize(), 0);
}

function isFileDrag(event) {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
}

let dragDepth = 0;

function handleDragEnter(event) {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  dragDepth += 1;
  elements.dropOverlay.classList.add("is-visible");
}

function handleDragOver(event) {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  elements.dropOverlay.classList.add("is-visible");
}

function handleDragLeave(event) {
  if (dragDepth === 0) return;
  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) elements.dropOverlay.classList.remove("is-visible");
}

async function handleDrop(event) {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  dragDepth = 0;
  elements.dropOverlay.classList.remove("is-visible");

  const files = Array.from(event.dataTransfer?.files || []);
  if (files.length !== 1) {
    showNotice("Drop one EPUB or KEPUB file at a time.", "error");
    return;
  }

  const item = Array.from(event.dataTransfer?.items || []).find(
    (candidate) => candidate.kind === "file",
  );
  const handlePromise =
    typeof item?.getAsFileSystemHandle === "function"
      ? item.getAsFileSystemHandle().catch(() => null)
      : Promise.resolve(null);
  const handle = await handlePromise;
  const file = handle?.kind === "file" ? await handle.getFile() : files[0];
  void openFile(file, handle?.kind === "file" ? handle : null);
}

function nextFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

let searchDebounceTimer = 0;

function initialize() {
  syncAppearanceControls();
  renderRecentBooks();
  void hydrateRecentHandles();
  restoreBaselineNotice();

  elements.openBook.addEventListener("click", promptForFile);
  elements.landingOpenBook.addEventListener("click", promptForFile);
  elements.fileInput.addEventListener("change", () => {
    const [file] = elements.fileInput.files;
    if (file) void openFile(file);
  });

  elements.previousPage.addEventListener("click", () => enqueueNavigation("prev"));
  elements.nextPage.addEventListener("click", () => enqueueNavigation("next"));
  elements.tocToggle.addEventListener("click", openTableOfContents);
  elements.recentToggle.addEventListener("click", toggleRecentBooks);
  elements.searchToggle.addEventListener("click", toggleSearch);
  elements.searchClose.addEventListener("click", () => closeSearch());
  elements.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    window.clearTimeout(searchDebounceTimer);
    void performSearch(elements.searchInput.value);
  });
  elements.searchInput.addEventListener("input", () => {
    window.clearTimeout(searchDebounceTimer);
    const query = elements.searchInput.value;
    if (query.trim().length < 2) {
      void performSearch(query);
      return;
    }
    searchDebounceTimer = window.setTimeout(
      () => void performSearch(query),
      SEARCH_DEBOUNCE_MS,
    );
  });
  elements.tocClose.addEventListener("click", () => closeTableOfContents());
  elements.tocBackdrop.addEventListener("click", () => closeTableOfContents());
  elements.fontDecrease.addEventListener("click", () => changeFontSize(-1));
  elements.fontIncrease.addEventListener("click", () => changeFontSize(1));
  elements.widthDecrease.addEventListener("click", () => changeReaderWidth(-1));
  elements.widthIncrease.addEventListener("click", () => changeReaderWidth(1));
  elements.themeToggle.addEventListener("click", () => {
    setTheme(state.theme === "dark" ? "light" : "dark");
  });
  elements.fullscreenToggle.addEventListener("click", () => void toggleFullscreen());
  elements.progress.addEventListener("input", previewProgress);
  elements.progress.addEventListener("change", () => void seekToProgress());

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.searchPanel.hidden) {
      event.preventDefault();
      closeSearch();
      return;
    }

    if (event.key === "Escape" && !elements.recentPanel.hidden) {
      event.preventDefault();
      closeRecentBooks();
      return;
    }

    if (event.key === "Escape" && elements.tocPanel.classList.contains("is-open")) {
      event.preventDefault();
      closeTableOfContents();
      return;
    }

    handleReaderKeydown(event);
  });
  document.addEventListener("dragenter", handleDragEnter);
  document.addEventListener("dragover", handleDragOver);
  document.addEventListener("dragleave", handleDragLeave);
  document.addEventListener("drop", handleDrop);
  document.addEventListener("click", (event) => {
    if (!elements.recentPanel.hidden && !elements.recentMenu.contains(event.target)) {
      closeRecentBooks(false);
    }
    if (!elements.searchPanel.hidden && !elements.searchMenu.contains(event.target)) {
      closeSearch(false);
    }
  });
  document.addEventListener("dragend", () => {
    dragDepth = 0;
    elements.dropOverlay.classList.remove("is-visible");
  });
  document.addEventListener("fullscreenchange", updateFullscreenControl);

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => state.rendition?.resize(), 80);
  });

  if (typeof window.ePub !== "function" || typeof window.JSZip !== "function") {
    elements.openBook.disabled = true;
    elements.landingOpenBook.disabled = true;
    elements.recentToggle.disabled = true;
    elements.searchToggle.disabled = true;
    showNotice("The EPUB reader libraries could not be loaded.", "error");
    return;
  }

  updateControlStates();
}

initialize();
