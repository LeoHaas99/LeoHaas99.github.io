/* Device-only book storage. One complete EPUB, plus small bookshelf previews. */
(() => {
  const databaseName = `epub-reader-cache-v1:${window.READER_CONFIG?.googleClientId || "local"}`;
  let databasePromise = null;
  let lastInfo = null;

  function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      let settled = false;
      const timer = setTimeout(() => {
        settled = true;
        reject(new Error("Offline storage did not open."));
      }, 5000);
      request.onupgradeneeded = () => {
        for (const name of ["last-book", "previews"]) {
          if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
        }
      };
      request.onsuccess = () => {
        clearTimeout(timer);
        if (settled) { request.result.close(); return; }
        const database = request.result;
        database.onversionchange = () => { database.close(); databasePromise = null; };
        resolve(database);
      };
      request.onerror = () => { clearTimeout(timer); reject(request.error); };
    }).catch((error) => { databasePromise = null; throw error; });
    return databasePromise;
  }

  async function transaction(storeName, mode, run) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(storeName, mode);
      let result;
      run(tx.objectStore(storeName), (value) => { result = value; });
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(tx.error || new Error("Offline storage is unavailable."));
    });
  }

  function changed(record) {
    if (record !== undefined) {
      lastInfo = record ? { fingerprint: record.fingerprint, title: record.title, driveSource: record.driveSource } : null;
    }
    window.dispatchEvent(new Event("reader-cache-changed"));
  }

  async function getLast() {
    const record = await transaction("last-book", "readonly", (store, done) => {
      store.get("last").onsuccess = (event) => done(event.target.result || null);
    });
    const valid = record?.file instanceof Blob && /^[a-f\d]{64}$/.test(record.fingerprint) && typeof record.fileName === "string";
    const saved = valid ? record : null;
    lastInfo = saved ? { fingerprint: saved.fingerprint, title: saved.title, driveSource: saved.driveSource } : null;
    return saved;
  }

  function asFile(record) {
    return new File([record.file], record.fileName, { type: "application/epub+zip", lastModified: record.lastModified });
  }

  function previewKey(source) { return `${source.accountId}:${source.id}`; }

  async function previews(accountId) {
    if (!accountId) return [];
    const records = await transaction("previews", "readonly", (store, done) => {
      store.getAll().onsuccess = (event) => done(event.target.result);
    });
    return records.filter((record) => record.driveSource?.accountId === accountId);
  }

  async function thumbnail(book) {
    const url = await book.coverUrl();
    // Only use artwork embedded in the EPUB, never an external URL from a book.
    if (!url?.startsWith("blob:")) return null;
    const blob = await (await fetch(url)).blob();
    if (!/^image\/(jpeg|png|gif|webp|avif)$/i.test(blob.type)) return null;
    const image = new Image();
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { image.src = ""; reject(new Error("Cover unavailable.")); }, 5000);
      image.onload = () => { clearTimeout(timer); resolve(); };
      image.onerror = () => { clearTimeout(timer); reject(new Error("Cover unavailable.")); };
      image.src = url;
    });
    const ratio = Math.min(160 / image.naturalWidth, 240 / image.naturalHeight, 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  }

  async function savePreview(book, record) {
    const source = record.driveSource;
    if (!source) return;
    const key = previewKey(source);
    const preview = {
      driveSource: source, fingerprint: record.fingerprint, title: record.title,
      author: record.author, openedAt: record.openedAt,
    };
    const hasCover = await transaction("previews", "readwrite", (store, done) => {
      store.get(key).onsuccess = (event) => {
        const previous = event.target.result;
        if (previous?.fingerprint === preview.fingerprint) preview.cover = previous.cover;
        store.put(preview, key);
        done(Boolean(preview.cover));
      };
    });
    changed();
    if (hasCover) return;
    const cover = await thumbnail(book).catch(() => null);
    if (!cover) return;
    await transaction("previews", "readwrite", (store) => {
      store.get(key).onsuccess = (event) => {
        const current = event.target.result;
        // A slow image decode must not replace a newer version or undo disconnect.
        if (current?.fingerprint === preview.fingerprint) store.put({ ...current, cover }, key);
      };
    });
    changed();
  }

  async function remember(file, book, fingerprint, driveSource, cached) {
    if (!fingerprint) return;
    const record = {
      file, fileName: file.name, lastModified: file.lastModified, fingerprint, driveSource,
      title: String(book.packaging?.metadata?.title || file.name).trim(), openedAt: Date.now(),
      author: String(book.packaging?.metadata?.creator || "").trim(),
      locations: cached?.fingerprint === fingerprint ? cached.locations : null,
    };
    try {
      await transaction("last-book", "readwrite", (store) => store.put(record, "last"));
      changed(record);
    } catch (error) {
      // Do not reopen an older book when storing the newly opened one failed.
      await removeLast(null, record.openedAt).catch(() => {});
      throw error;
    }
    void savePreview(book, record).catch((error) => console.warn("Could not save the book preview.", error));
  }

  async function saveLocations(fingerprint, locations, breakSize) {
    await transaction("last-book", "readwrite", (store) => {
      store.get("last").onsuccess = (event) => {
        const record = event.target.result;
        if (record?.fingerprint === fingerprint) {
          store.put({ ...record, locations: { version: 1, breakSize, value: locations } }, "last");
        }
      };
    });
  }

  async function removeLast(accountId = null, openedBefore = Infinity) {
    const remaining = await transaction("last-book", "readwrite", (store, done) => {
      store.get("last").onsuccess = (event) => {
        const record = event.target.result;
        if ((!accountId || record?.driveSource?.accountId === accountId) && (record?.openedAt || 0) <= openedBefore) {
          store.delete("last");
          done(null);
        } else done(record || null);
      };
    });
    changed(remaining);
  }

  async function forgetAccount(accountId) {
    await removeLast(accountId);
    await transaction("previews", "readwrite", (store) => {
      store.openCursor().onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) return;
        if (cursor.value.driveSource?.accountId === accountId) cursor.delete();
        cursor.continue();
      };
    });
    changed();
  }

  window.readerBookCache = { getLast, asFile, previews, remember, saveLocations, removeLast, forgetAccount,
    get lastInfo() { return lastInfo; } };
})();
