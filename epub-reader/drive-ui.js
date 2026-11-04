(() => {
  const ids = ["bookshelf", "bookshelf-toggle", "landing-bookshelf", "bookshelf-close", "drive-account",
    "drive-setup", "drive-connect", "drive-disconnect", "drive-sync", "drive-status", "drive-permissions",
    "drive-browser", "drive-root", "drive-up", "drive-refresh", "drive-use-folder", "drive-folder-name",
    "drive-filter", "drive-list-status", "drive-files", "sync-prompt", "sync-resume", "sync-keep",
    "offline-book-status", "remove-offline-book"];
  const ui = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
  const clientId = window.READER_CONFIG?.googleClientId?.trim() || "";
  const configured = /^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId);
  const root = { id: "root", name: "My Drive" };
  let folders = [root];
  let files = [];
  let library = null;
  let libraryLoaded = false;
  let busy = false;
  let viewVersion = 0;
  let offer = null;
  let checking = false;
  let lastCheck = 0;
  let previews = new Map();
  let coverUrls = [];
  const client = new EpubDrive.DriveClient(clientId, (message, kind) => {
    ui["drive-status"].textContent = message;
    ui["drive-status"].dataset.kind = kind;
    ui["bookshelf-toggle"].dataset.sync = kind;
    ui["bookshelf-toggle"].title = `Google Drive bookshelf — ${message}`;
    controls();
  });

  function controls() {
    ui["drive-setup"].hidden = configured;
    ui["drive-connect"].hidden = client.connected;
    ui["drive-connect"].textContent = client.account ? "Reconnect Google Drive" : "Connect Google Drive";
    ui["drive-connect"].disabled = !configured || busy;
    ui["drive-disconnect"].hidden = !client.account;
    ui["drive-sync"].hidden = !client.connected;
    ui["drive-permissions"].hidden = client.connected;
    ui["drive-browser"].hidden = !client.connected;
    ui["drive-account"].textContent = client.account
      ? `${client.account.name || "Google Drive"} · ${client.account.email || ""}`
      : "Read from Google Drive on any device.";
    for (const id of ["drive-root", "drive-up", "drive-refresh", "drive-use-folder", "drive-sync"]) ui[id].disabled = busy;
    ui["drive-up"].disabled = busy || folders.length < 2;
    ui["drive-use-folder"].disabled = busy || folders.at(-1).id === library?.id;
    ui["drive-use-folder"].textContent = folders.at(-1).id === library?.id ? "Your book folder" : "Use this folder";
    ui.bookshelf.setAttribute("aria-busy", String(busy));
    const offline = window.readerBookCache?.lastInfo;
    const available = canOpenCachedBook(offline);
    ui["offline-book-status"].textContent = available
      ? `Available offline on this device: ${offline.title}`
      : "The last book you open is kept on this device for offline reading.";
    ui["remove-offline-book"].hidden = !available;
    updateCachedBookControl();
  }

  function fail(error) {
    client.status(error?.message || "Google Drive is unavailable. Please try again.", "error");
  }

  async function show() {
    if (!ui.bookshelf.open) ui.bookshelf.showModal();
    closeSearch(false);
    closeRecentBooks(false);
    closeTableOfContents(false);
    controls();
    if (!configured || busy) return;
    if (!client.connected) {
      busy = true;
      controls();
      client.status(client.account ? "Reconnect to open your books and sync positions." : "Loading Google sign-in…");
      try {
        await client.loadIdentity();
        client.status("Connect to open your books and sync positions.");
      } catch (error) { fail(error); }
      busy = false;
      controls();
    } else if (!libraryLoaded) {
      await loadLibrary();
    } else if (!files.length) {
      await browse(folders);
    } else {
      await loadPreviews();
      renderFiles();
    }
  }

  async function loadLibrary() {
    if (busy || !client.connected) return;
    const generation = client.generation;
    const version = ++viewVersion;
    busy = true;
    controls();
    ui["drive-list-status"].textContent = "Loading book folder…";
    try {
      const selectedLibrary = await client.library();
      if (generation !== client.generation || version !== viewVersion) return;
      library = selectedLibrary;
      libraryLoaded = true;
      files = [];
      folders = library && library.id !== "root" ? [root, library] : [root];
      busy = false;
      await browse(folders);
    } catch (error) {
      if (generation === client.generation && version === viewVersion) fail(error);
    } finally {
      if (generation === client.generation && version === viewVersion) { busy = false; controls(); }
    }
  }

  async function loadPreviews() {
    const accountId = client.account?.id;
    const records = await window.readerBookCache?.previews(accountId).catch(() => []) || [];
    if (accountId === client.account?.id) previews = new Map(records.map((record) => [record.driveSource.id, record]));
  }

  function previewFor(file) {
    const preview = previews.get(file.id);
    return preview && (!file.modifiedTime || !preview.driveSource.modifiedTime ||
      preview.driveSource.modifiedTime === file.modifiedTime) ? preview : null;
  }

  function displayName(file) {
    return file.name.replace(/(?:\.kepub)?\.epub$|\.kepub$|\.epu$/i, "")
      .split(/\s+--\s+/)[0].replace(/_converted$/i, "").replace(/_/g, " ")
      .replace(/\s*\((?:z-lib[^)]*|z-library[^)]*)\)/gi, "")
      .replace(/\s*[-–]\s*(?:libgen\.\w+|Anna[’']s Archive).*$/i, "")
      .replace(/\s*\([^)]*$/, "")
      .replace(/\s+97[89]\d{10}\b/g, "").trim() || file.name;
  }

  function renderFiles() {
    coverUrls.forEach((url) => URL.revokeObjectURL(url));
    coverUrls = [];
    const query = ui["drive-filter"].value.trim().toLocaleLowerCase();
    const matching = files.filter((file) => {
      const preview = previewFor(file);
      return [file.name, preview?.title, preview?.author].join(" ").toLocaleLowerCase().includes(query);
    }).sort((a, b) => Number(b.mimeType === EpubDrive.FOLDER_TYPE) - Number(a.mimeType === EpubDrive.FOLDER_TYPE) ||
      (previewFor(b)?.openedAt || 0) - (previewFor(a)?.openedAt || 0) || displayName(a).localeCompare(displayName(b)));
    ui["drive-files"].replaceChildren();
    for (const file of matching) {
      const folder = file.mimeType === EpubDrive.FOLDER_TYPE;
      const preview = folder ? null : previewFor(file);
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "drive-file";
      button.title = file.name;
      button.disabled = busy || file.capabilities?.canDownload === false && !folder;
      const icon = document.createElement("span");
      icon.className = folder ? "drive-file-icon" : "drive-book-cover";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = folder ? "▱" : "▤";
      if (preview?.cover instanceof Blob) {
        const image = document.createElement("img");
        const url = URL.createObjectURL(preview.cover);
        coverUrls.push(url);
        image.src = url;
        image.alt = "";
        image.loading = "lazy";
        icon.replaceChildren(image);
      }
      const text = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = folder ? file.name : preview?.title || displayName(file);
      const detail = document.createElement("small");
      detail.textContent = folder ? "Folder" : file.capabilities?.canDownload === false ? "Download not permitted"
        : `${/kepub/i.test(file.name) ? "KEPUB" : "EPUB"}${file.size ? ` · ${(Number(file.size) / 1048576).toFixed(1)} MB` : ""}`;
      text.append(title);
      if (preview?.author) {
        const author = document.createElement("span");
        author.className = "drive-book-author";
        author.textContent = preview.author;
        text.append(author);
      }
      if (preview) {
        detail.textContent += window.readerBookCache?.lastInfo?.fingerprint === preview.fingerprint ? " · Available offline" : " · Recently opened";
      }
      text.append(detail);
      button.append(icon, text);
      button.addEventListener("click", () => folder
        ? void browse([...folders, { id: file.id, name: file.name }]) : void openDriveFile(file));
      item.append(button);
      ui["drive-files"].append(item);
    }
    ui["drive-list-status"].textContent = matching.length ? `${matching.length} ${matching.length === 1 ? "item" : "items"}`
      : query ? "No matching books or folders." : "No EPUBs or folders here. Choose another folder.";
  }

  async function browse(path) {
    if (busy || !client.connected) return;
    const version = ++viewVersion;
    busy = true;
    controls();
    ui["drive-list-status"].textContent = "Loading folder…";
    ui["drive-files"].replaceChildren();
    try {
      const children = await client.children(path.at(-1).id);
      await loadPreviews();
      if (version !== viewVersion) return;
      files = children;
      folders = path;
      ui["drive-folder-name"].textContent = path.map((folder) => folder.name).join(" / ");
      ui["drive-filter"].value = "";
    } catch (error) {
      if (version === viewVersion) {
        files = [];
        fail(error);
        ui["drive-list-status"].textContent = "Folder unavailable. Try My Drive or reconnect.";
      }
    } finally {
      if (version === viewVersion) { busy = false; controls(); renderFiles(); }
    }
  }

  async function openDriveFile(file, accountId = client.account?.id) {
    if (busy || state.busy) return;
    if (!accountId || accountId !== client.account?.id) {
      await show();
      client.status("Connect the Google account used for this book, then select it again.", "pending");
      return;
    }
    const version = ++viewVersion;
    busy = true;
    controls();
    renderFiles();
    client.status(`Opening ${file.name}…`);
    try {
      const cached = await window.readerBookCache?.getLast().catch(() => null);
      const useCache = cached?.driveSource?.accountId === accountId && cached.driveSource.id === file.id &&
        (!file.modifiedTime || cached.driveSource.modifiedTime === file.modifiedTime);
      if (!useCache && !client.connected) {
        busy = false;
        await show();
        client.status("Reconnect to open this book. Your last downloaded book is available offline.", "pending");
        return;
      }
      const bookFile = useCache ? window.readerBookCache.asFile(cached) : await client.download(file);
      if (version !== viewVersion || accountId !== client.account?.id) return;
      await client.flush();
      if (version !== viewVersion || accountId !== client.account?.id) return;
      // Keep the previous book intact if the download or EPUB parsing fails.
      const opened = await openFile(bookFile, null,
        { id: file.id, accountId, modifiedTime: file.modifiedTime || (useCache ? cached.driveSource.modifiedTime : null) },
        { cachedBook: useCache ? cached : null });
      if (opened) ui.bookshelf.close();
      else client.status(elements.notice.textContent || "This book could not be opened.", "error");
    } catch (error) { if (version === viewVersion) fail(error); }
    finally { if (version === viewVersion) { busy = false; controls(); renderFiles(); } }
  }

  async function reconcile(force = false) {
    if (checking || !client.connected || state.busy || !state.fingerprint ||
        state.driveSource && state.driveSource.accountId !== client.account.id ||
        !force && Date.now() - lastCheck < 15000) return;
    const fingerprint = state.fingerprint;
    const generation = client.generation;
    const accountId = client.account.id;
    const active = client.active;
    const before = active?.updatedAt;
    checking = true;
    lastCheck = Date.now();
    try {
      await client.flush();
      const remote = await client.position(fingerprint);
      if (generation !== client.generation || state.fingerprint !== fingerprint || state.busy) return;
      const cached = client.read(client.dataKey(accountId, `position:${fingerprint}`), null);
      const pending = client.read(client.dataKey(accountId, "pending"), {})[fingerprint];
      const latest = EpubDrive.latestPosition([remote, cached, pending], fingerprint);
      if (!client.active || client.active.accountId !== accountId) {
        client.activate(fingerprint, cached);
        client.active.cfi = state.currentLocation?.start?.cfi;
      }
      // Never move the page underneath someone who kept reading during the fetch.
      if (active && active.updatedAt !== before) return;
      if (latest && latest.deviceId !== client.deviceId &&
          Date.parse(latest.updatedAt) > (Date.parse(client.active.updatedAt) || 0)) {
        offer = { position: latest, fingerprint, accountId };
        ui["sync-prompt"].hidden = false;
      }
    } catch { client.status("Could not check other devices. Your local position is safe.", "pending"); }
    finally { checking = false; }
  }

  ui["drive-connect"].addEventListener("click", () => {
    if (busy) return;
    if (!window.google?.accounts?.oauth2) { void show(); return; }
    busy = true;
    controls();
    const connection = client.connect();
    const generation = client.generation;
    client.status("Connecting to Google Drive…");
    void connection.then(async () => {
      await client.flush();
      if (generation !== client.generation) return;
      files = [];
      folders = [root];
      library = null;
      libraryLoaded = false;
      busy = false;
      await loadLibrary();
      await reconcile(true);
    }).catch((error) => { if (generation === client.generation) fail(error); })
      .finally(() => { if (generation === client.generation) { busy = false; controls(); } });
  });
  ui["drive-disconnect"].addEventListener("click", () => {
    const accountId = client.account?.id;
    viewVersion += 1;
    client.disconnect();
    busy = false;
    files = [];
    folders = [root];
    library = null;
    libraryLoaded = false;
    previews = new Map();
    offer = null;
    ui["sync-prompt"].hidden = true;
    controls();
    renderFiles();
    if (accountId) void window.readerBookCache?.forgetAccount(accountId).catch(() => {
      client.status("Disconnected. The offline copy could not be removed; clear this site's storage to remove it.", "error");
    });
  });
  ui["drive-use-folder"].addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    controls();
    try {
      const folder = folders.at(-1);
      await client.setLibrary(folder);
      library = folder;
      client.status(`Book folder saved: ${folder.name}`, "synced");
    } catch (error) { fail(error); }
    finally { busy = false; controls(); }
  });
  ui["drive-root"].addEventListener("click", () => void browse([root]));
  ui["drive-up"].addEventListener("click", () => void browse(folders.slice(0, -1)));
  ui["drive-refresh"].addEventListener("click", () => void browse(folders));
  ui["drive-filter"].addEventListener("input", renderFiles);
  ui["drive-sync"].addEventListener("click", () => void client.flush().then(() => reconcile(true)));
  ui["bookshelf-toggle"].addEventListener("click", () => void show());
  ui["landing-bookshelf"].addEventListener("click", () => void show());
  ui["bookshelf-close"].addEventListener("click", () => ui.bookshelf.close());
  ui.bookshelf.addEventListener("close", () => { viewVersion += 1; busy = false; controls(); renderFiles(); });
  ui.bookshelf.addEventListener("keydown", (event) => event.stopPropagation());
  let backdropPointer = false;
  const outside = (event) => {
    const rect = ui.bookshelf.getBoundingClientRect();
    return event.target === ui.bookshelf && (event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom);
  };
  ui.bookshelf.addEventListener("pointerdown", (event) => {
    backdropPointer = event.pointerType === "mouse" && outside(event);
  });
  ui.bookshelf.addEventListener("click", (event) => {
    if (backdropPointer && outside(event)) ui.bookshelf.close();
    backdropPointer = false;
  });
  ui["remove-offline-book"].addEventListener("click", async () => {
    try { await window.readerBookCache.removeLast(); }
    catch { client.status("The offline copy could not be removed. Try again.", "error"); }
  });
  window.addEventListener("reader-cache-changed", () => {
    controls();
    void loadPreviews().then(renderFiles);
  });

  ui["sync-resume"].addEventListener("click", async () => {
    const selected = offer;
    offer = null;
    ui["sync-prompt"].hidden = true;
    if (!selected || state.busy || selected.fingerprint !== state.fingerprint || selected.accountId !== client.account?.id) return;
    const rendition = state.rendition;
    client.activate(selected.fingerprint, selected.position);
    try {
      await rendition.display(selected.position.cfi);
      if (state.rendition !== rendition || state.fingerprint !== selected.fingerprint ||
          client.account?.id !== selected.accountId) return;
      alignSearchResult(rendition, selected.position.cfi);
      client.write(client.dataKey(selected.accountId, `position:${selected.fingerprint}`), selected.position);
      // Explicitly choosing the remote location is a new reading decision too.
      client.activate(selected.fingerprint, null);
      client.interact();
      client.observe(selected.fingerprint, selected.position.cfi, selected.position.percentage);
      void client.flush();
      hideMobileControls();
    } catch { showNotice("That synced position could not be opened.", "error"); }
  });
  ui["sync-keep"].addEventListener("click", () => {
    const selected = offer;
    offer = null;
    ui["sync-prompt"].hidden = true;
    if (!selected || state.busy || selected.fingerprint !== state.fingerprint || selected.accountId !== client.account?.id) return;
    // Choosing this device explicitly is a new reading decision, even backwards.
    client.write(client.dataKey(selected.accountId, `position:${selected.fingerprint}`), selected.position);
    client.activate(state.fingerprint, null);
    client.interact();
    client.observe(state.fingerprint, state.currentLocation?.start?.cfi, Number(elements.progress.value) / 100);
    void client.flush();
  });

  window.addEventListener("online", () => void client.flush().then(() => reconcile(true)));
  window.addEventListener("focus", () => { if (!ui.bookshelf.open) void reconcile(); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) void client.flush();
    else void reconcile();
  });
  window.addEventListener("pagehide", () => void client.flush());

  window.readerDrive = {
    preparePosition: (fingerprint, local) => client.prepare(fingerprint, local),
    activate: (fingerprint, position) => {
      offer = null;
      ui["sync-prompt"].hidden = true;
      client.activate(fingerprint, position);
    },
    interact: () => client.interact(),
    suspend: () => client.suspend(),
    observe: (fingerprint, cfi, percentage) => client.observe(fingerprint, cfi, percentage),
    openRecent: (record) => openDriveFile({ id: record.driveId, name: record.fileName || `${record.title}.epub` }, record.driveAccountId),
    flush: () => client.flush(),
    isAccountActive: (accountId) => client.account?.id === accountId,
  };
  controls();
  if (client.connected) {
    client.status("Connected", "synced");
    void client.flush();
  }
})();
