const PREFS_KEY = "epub-reader:prefs:v1";
const POSITION_PREFIX = "epub-reader:position:";
const FONT_MIN = 80;
const FONT_MAX = 300;
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
  dropOverlay: document.querySelector("#drop-overlay"),
};

const storageAvailableAtStart = detectStorage();
const initialPreferences = loadPreferences(storageAvailableAtStart);

const state = {
  book: null,
  rendition: null,
  fingerprint: null,
  metadata: null,
  tocEntries: [],
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
  if (!state.storageAvailable || !state.fingerprint || !cfi) return;

  try {
    window.localStorage.setItem(
      `${POSITION_PREFIX}${state.fingerprint}`,
      JSON.stringify({
        cfi,
        percentage: Number.isFinite(percentage) ? percentage : null,
        updatedAt: new Date().toISOString(),
      }),
    );
  } catch {
    markPersistenceUnavailable();
  }
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

function promptForFile() {
  if (state.busy) return;
  elements.fileInput.value = "";
  elements.fileInput.click();
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

async function openFile(file) {
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

    promoteCandidate({
      book: candidateBook,
      rendition: candidateRendition,
      fingerprint,
      metadata,
      navigation,
      file,
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

    void prepareLocations(state.book, state.rendition);
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
}) {
  const previousBook = state.book;
  const previousRendition = state.rendition;

  state.book = book;
  state.rendition = rendition;
  state.fingerprint = fingerprint;
  state.metadata = metadata || {};
  state.locationsReady = false;
  state.currentLocation = null;
  state.currentChapter = "";
  state.atStart = false;
  state.atEnd = false;
  state.navigationQueue = Promise.resolve();

  const displayTitle =
    `${metadata?.title || ""}`.trim() ||
    file.name.replace(/(?:\.kepub)?\.epub$|\.kepub$|\.epu$/i, "");
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
    elements.locationLabel.textContent = state.currentChapter
      ? `${state.currentChapter} · Progress unavailable`
      : "Reading progress unavailable";
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

  if (Number.isFinite(percentage)) {
    const percentageValue = clamp(percentage * 100, 0, 100);
    const roundedPercentage = Math.round(percentageValue);
    elements.progress.value = percentageValue.toFixed(1);
    elements.progressValue.value = `${roundedPercentage}%`;
    elements.progressValue.textContent = `${roundedPercentage}%`;
    elements.progress.setAttribute("aria-valuetext", `${roundedPercentage}% read`);
    elements.locationLabel.textContent = state.currentChapter
      ? `${state.currentChapter} · ${roundedPercentage}%`
      : `${roundedPercentage}% read`;
  } else {
    const displayed = location.start.displayed;
    const localPage = displayed?.page;
    const localTotal = displayed?.total;
    const pageLabel =
      Number.isFinite(localPage) && Number.isFinite(localTotal)
        ? `Page ${localPage} of ${localTotal} in section`
        : "Calculating reading progress…";
    elements.locationLabel.textContent = state.currentChapter
      ? `${state.currentChapter} · ${pageLabel}`
      : pageLabel;
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

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    enqueueNavigation("prev");
    return;
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    enqueueNavigation("next");
    return;
  }

  if (event.code === "Space" || event.key === " " || event.key === "Spacebar") {
    event.preventDefault();
    enqueueNavigation(event.shiftKey ? "prev" : "next");
  }
}

function openTableOfContents() {
  if (elements.tocToggle.disabled) return;
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

function handleDrop(event) {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  dragDepth = 0;
  elements.dropOverlay.classList.remove("is-visible");

  const files = Array.from(event.dataTransfer?.files || []);
  if (files.length !== 1) {
    showNotice("Drop one EPUB or KEPUB file at a time.", "error");
    return;
  }

  void openFile(files[0]);
}

function nextFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function initialize() {
  syncAppearanceControls();
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
    showNotice("The EPUB reader libraries could not be loaded.", "error");
    return;
  }

  updateControlStates();
}

initialize();
