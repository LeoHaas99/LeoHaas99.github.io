/* Google Drive transport and progress storage. Books are only ever read. */
(() => {
  const SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive.appdata",
  ];
  const FOLDER_TYPE = "application/vnd.google-apps.folder";
  const POSITION_PREFIX = "reader-position-v1-";
  const LIBRARY_FILE = "reader-library-v1.json";
  const quote = (value) => String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const validId = (value) => typeof value === "string" && /^[\w-]+$/.test(value);
  const validPosition = (value, fingerprint) => Boolean(
    value && value.version === 1 && value.fingerprint === fingerprint && /^[a-f\d]{64}$/.test(fingerprint) &&
    typeof value.cfi === "string" && value.cfi.startsWith("epubcfi(") &&
    value.cfi.endsWith(")") && value.cfi.length < 8192 &&
    Number.isFinite(Date.parse(value.updatedAt)),
  );
  function latestPosition(records, fingerprint) {
    return records.filter((record) => validPosition(record, fingerprint))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) ||
        String(b.deviceId || "").localeCompare(String(a.deviceId || "")))[0] || null;
  }

  class DriveClient {
    constructor(clientId, onStatus = () => {}) {
      this.clientId = clientId;
      this.onStatus = onStatus;
      this.prefix = `epub-reader:drive:v1:${clientId}:`;
      this.memory = new Map();
      this.storageWarning = false;
      this.deviceId = this.read("device", null) || crypto.randomUUID();
      this.write("device", this.deviceId);
      this.account = this.read("account", null);
      this.token = null;
      this.generation = 0;
      this.active = null;
      this.timer = 0;
      this.flushing = null;
      this.retryDelay = 5000;
    }

    read(key, fallback) {
      if (this.storageWarning && this.memory.has(key)) return this.memory.get(key);
      try { return JSON.parse(localStorage.getItem(this.prefix + key)) ?? fallback; }
      catch { return this.memory.get(key) ?? fallback; }
    }

    write(key, value) {
      this.memory.set(key, value);
      try { localStorage.setItem(this.prefix + key, JSON.stringify(value)); }
      catch { this.storageWarning = true; }
    }

    status(message, kind = "idle") {
      this.onStatus(message, kind);
    }

    get connected() {
      return Boolean(this.token && this.token.expiresAt > Date.now() && this.account &&
        this.token.accountId === this.account.id);
    }

    async loadIdentity() {
      if (window.google?.accounts?.oauth2) return;
      if (this.identityPromise) return this.identityPromise;
      this.identityPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        const timer = setTimeout(() => finish(new Error("Google sign-in did not load. Check your connection and try again.")), 15000);
        const finish = (error) => {
          clearTimeout(timer);
          script.onload = script.onerror = null;
          if (error) { script.remove(); reject(error); }
          else resolve();
        };
        script.onload = () => window.google?.accounts?.oauth2
          ? finish() : finish(new Error("Google sign-in is unavailable."));
        script.onerror = () => finish(new Error("Google sign-in could not load. Check your connection or browser blocker."));
        document.head.append(script);
      }).catch((error) => { this.identityPromise = null; throw error; });
      return this.identityPromise;
    }

    // Call directly from a click, after loadIdentity, to preserve popup activation.
    connect() {
      const generation = ++this.generation;
      this.token = null;
      return new Promise((resolve, reject) => {
        const client = google.accounts.oauth2.initTokenClient({
          client_id: this.clientId,
          scope: SCOPES.join(" "),
          include_granted_scopes: false,
          callback: async (response) => {
            if (generation !== this.generation) return reject(new Error("Connection cancelled."));
            if (response.error || !response.access_token || !(Number(response.expires_in) > 0) ||
                !google.accounts.oauth2.hasGrantedAllScopes(response, ...SCOPES)) {
              return reject(new Error("Allow both Drive reading and app-data access to connect the bookshelf."));
            }
            this.token = { value: response.access_token, expiresAt: Date.now() + Number(response.expires_in) * 1000 - 30000 };
            try {
              const { user } = await this.request("about", { fields: "user(permissionId,displayName,emailAddress)" });
              if (!validId(user?.permissionId)) throw new Error("Google did not return an account identifier.");
              this.account = { id: user.permissionId, name: user.displayName, email: user.emailAddress };
              // Do not flush the previous account's queue while identifying a new token.
              this.token.accountId = this.account.id;
              this.write("account", this.account);
              // A new account never inherits another account's active book or queue.
              this.active = null;
              this.status("Connected", "synced");
              resolve(this.account);
            } catch (error) {
              if (generation === this.generation) this.token = null;
              reject(error);
            }
          },
          error_callback: () => reject(new Error("Google sign-in was closed or blocked. Try Connect again.")),
        });
        client.requestAccessToken({ prompt: "select_account" });
      });
    }

    disconnect() {
      this.generation += 1;
      this.token = null;
      this.account = null;
      this.active = null;
      clearTimeout(this.timer);
      this.timer = 0;
      this.write("account", null);
      this.status("Disconnected. Reading positions remain on this device.");
    }

    async request(path, params = {}, options = {}) {
      if (!this.token || this.token.expiresAt <= Date.now()) {
        this.token = null;
        this.status("Reconnect to sync. Your position is saved on this device.", "pending");
        throw new Error("Reconnect to Google Drive to continue.");
      }
      const generation = this.generation;
      const { upload = false, binary = false, ...fetchOptions } = options;
      const url = new URL(`${upload ? "https://www.googleapis.com/upload/drive/v3/" : "https://www.googleapis.com/drive/v3/"}${path}`);
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), binary ? 90000 : 20000);
      try {
        const response = await fetch(url, {
          ...fetchOptions,
          headers: { ...fetchOptions.headers, Authorization: `Bearer ${this.token.value}` },
          signal: controller.signal,
          cache: "no-store",
          credentials: "omit",
        });
        if (generation !== this.generation) throw new Error("Drive account changed. Please try again.");
        if (!response.ok) {
          if (response.status === 401) {
            this.token = null;
            this.status("Reconnect to sync. Your position is saved on this device.", "pending");
          }
          const error = new Error(response.status === 401 ? "Reconnect to Google Drive to continue."
            : response.status === 404 ? "That Drive file or folder is no longer available."
              : response.status === 403 ? "Google Drive denied access. Check permissions and that the Drive API is enabled."
                : response.status === 429 ? "Google Drive is busy. Please try again shortly."
                  : "Google Drive could not complete the request. Try again.");
          error.status = response.status;
          throw error;
        }
        const data = binary ? await response.arrayBuffer() : await response.json();
        if (generation !== this.generation) throw new Error("Drive account changed. Please try again.");
        return data;
      } finally { clearTimeout(timeout); }
    }

    async list(query, space = "drive", fields = "id,name,mimeType,size,modifiedTime,shortcutDetails,capabilities(canDownload)") {
      const files = [];
      let pageToken = "";
      do {
        const page = await this.request("files", {
          q: `trashed = false and (${query})`, spaces: space,
          fields: `nextPageToken,files(${fields})`, pageSize: "1000",
          ...(space === "drive" ? { supportsAllDrives: "true", includeItemsFromAllDrives: "true" } : {}),
          ...(pageToken ? { pageToken } : {}),
        });
        files.push(...(page.files || []));
        pageToken = page.nextPageToken || "";
      } while (pageToken);
      return files;
    }

    async children(folderId) {
      if (!validId(folderId)) throw new Error("Invalid Drive folder.");
      return (await this.list(`'${quote(folderId)}' in parents`))
        .map((file) => file.shortcutDetails ? { ...file, id: file.shortcutDetails.targetId, mimeType: file.shortcutDetails.targetMimeType } : file)
        .filter((file) => file.mimeType === FOLDER_TYPE || /\.(epub|kepub|epu)$/i.test(file.name))
        .sort((a, b) => Number(b.mimeType === FOLDER_TYPE) - Number(a.mimeType === FOLDER_TYPE) || a.name.localeCompare(b.name));
    }

    async download(file) {
      if (!validId(file.id)) throw new Error("Invalid Drive file.");
      const bytes = await this.request(`files/${encodeURIComponent(file.id)}`, { alt: "media", supportsAllDrives: "true" }, { binary: true });
      return new File([bytes], file.name, { type: "application/epub+zip" });
    }

    appFiles(name, contains = false) {
      return this.list(`name ${contains ? "contains" : "="} '${quote(name)}'`, "appDataFolder", "id,name,modifiedTime,size");
    }

    async readJson(file) {
      if (Number(file.size) > 32768) throw new Error("Saved reader data is too large.");
      return this.request(`files/${encodeURIComponent(file.id)}`, { alt: "media" });
    }

    async writeJson(name, data, fileId = null) {
      if (fileId) {
        return this.request(`files/${encodeURIComponent(fileId)}`, { uploadType: "media", fields: "id" }, {
          upload: true, method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
        });
      }
      const boundary = `reader_${crypto.randomUUID()}`;
      const metadata = { name, mimeType: "application/json", parents: ["appDataFolder"] };
      const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(data)}\r\n--${boundary}--`;
      return this.request("files", { uploadType: "multipart", fields: "id" }, {
        upload: true, method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body,
      });
    }

    async library() {
      const files = await this.appFiles(LIBRARY_FILE);
      files.sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime));
      if (!files.length) return null;
      const saved = await this.readJson(files[0]);
      return validId(saved?.id) && typeof saved.name === "string" ? saved : null;
    }

    async setLibrary(folder) {
      if (!validId(folder.id)) throw new Error("Invalid folder.");
      const files = await this.appFiles(LIBRARY_FILE);
      await this.writeJson(LIBRARY_FILE, { id: folder.id, name: folder.name }, files[0]?.id);
    }

    dataKey(accountId, suffix) { return `${accountId}:${suffix}`; }

    async position(fingerprint) {
      const files = await this.appFiles(`${POSITION_PREFIX}${fingerprint}-`, true);
      const records = await Promise.all(files.map(async (file) => {
        try { return await this.readJson(file); }
        catch (error) {
          if (error.status === 404 || error instanceof SyntaxError) return null;
          throw error;
        }
      }));
      return latestPosition(records, fingerprint);
    }

    async prepare(fingerprint, localPosition) {
      const accountId = this.account?.id;
      if (!accountId || !fingerprint) return localPosition;
      const key = this.dataKey(accountId, "pending");
      const pending = this.read(key, {})[fingerprint];
      const cached = this.read(this.dataKey(accountId, `position:${fingerprint}`), null);
      let remote = null;
      if (this.connected) {
        try { remote = await this.position(fingerprint); }
        catch { this.status("Could not check cloud progress. Using the position saved on this device.", "pending"); }
      }
      if (accountId !== this.account?.id) return localPosition;
      // A normal page reflow can update localStorage; only deliberate reading
      // updates enter the account's cloud queue and participate in this merge.
      let latest = latestPosition([remote, pending, cached], fingerprint);
      if (!latest && localPosition) {
        const imported = { ...localPosition, fingerprint, version: 1, deviceId: this.deviceId };
        if (validPosition(imported, fingerprint)) {
          latest = imported;
          this.write(key, { ...this.read(key, {}), [fingerprint]: imported });
          this.scheduleFlush();
        }
      }
      if (latest) this.write(this.dataKey(accountId, `position:${fingerprint}`), latest);
      return latest || localPosition;
    }

    activate(fingerprint, position) {
      this.active = { fingerprint, accountId: this.account?.id, cfi: position?.cfi, updatedAt: position?.updatedAt, interactionUntil: 0 };
    }

    interact() {
      if (this.active) this.active.interactionUntil = Date.now() + 10000;
    }

    suspend() {
      if (this.active) this.active.interactionUntil = 0;
    }

    scheduleFlush(delay = 5000) {
      if (!this.timer) this.timer = setTimeout(() => { this.timer = 0; void this.flush(); }, delay);
    }

    observe(fingerprint, cfi, percentage) {
      const active = this.active;
      if (!active || active.fingerprint !== fingerprint || typeof cfi !== "string" || !cfi.startsWith("epubcfi(")) return;
      const moved = active.cfi !== cfi;
      active.cfi = cfi;
      if (!moved || Date.now() > active.interactionUntil || !active.accountId || active.accountId !== this.account?.id) return;
      const cached = this.read(this.dataKey(active.accountId, `position:${fingerprint}`), null);
      const record = {
        version: 1, fingerprint, cfi, percentage, deviceId: this.deviceId,
        updatedAt: new Date(Math.max(Date.now(), (Date.parse(cached?.updatedAt) || 0) + 1)).toISOString(),
      };
      active.updatedAt = record.updatedAt;
      this.write(this.dataKey(active.accountId, `position:${fingerprint}`), record);
      const key = this.dataKey(active.accountId, "pending");
      this.write(key, { ...this.read(key, {}), [fingerprint]: record });
      this.status(this.storageWarning ? "Browser storage is unavailable. Keep this tab open until synced."
        : this.connected ? "Saving position…" : "Saved on this device. Reconnect to sync.", "pending");
      // Throttle, rather than debounce: continuous scrolling must still sync.
      this.scheduleFlush();
    }

    flush() {
      if (this.flushing) return this.flushing;
      if (!this.connected) return Promise.resolve();
      const accountId = this.account.id;
      const generation = this.generation;
      const run = async () => {
        const key = this.dataKey(accountId, "pending");
        for (const fingerprint of Object.keys(this.read(key, {}))) {
          if (generation !== this.generation || !this.connected) return;
          const record = this.read(key, {})[fingerprint];
          if (!validPosition(record, fingerprint)) continue;
          const name = `${POSITION_PREFIX}${fingerprint}-${this.deviceId}.json`;
          const files = await this.appFiles(name);
          const current = files.length ? await this.readJson(files[0]) : null;
          const newest = latestPosition([record, current], fingerprint);
          if (newest === record) await this.writeJson(name, record, files[0]?.id);
          if (generation !== this.generation) return;
          const pending = this.read(key, {});
          if (pending[fingerprint]?.updatedAt === record.updatedAt) {
            delete pending[fingerprint];
            this.write(key, pending);
          }
        }
        if (generation === this.generation) {
          this.retryDelay = 5000;
          this.status(Object.keys(this.read(key, {})).length ? "Saving position…" : "Reading positions synced",
            Object.keys(this.read(key, {})).length ? "pending" : "synced");
        }
      };
      // Two tabs on the same browser share a device record. Serialize their writes.
      this.flushing = (navigator.locks
        ? navigator.locks.request(`reader-drive:${this.clientId}:${accountId}`, run) : run())
        .catch(() => {
          if (generation !== this.generation) return;
          this.retryDelay = Math.min(this.retryDelay * 2, 60000);
          this.status("Position saved on this device. Reconnect or retry sync when online.", "pending");
        })
        .finally(() => {
          this.flushing = null;
          if (generation === this.generation && this.connected && navigator.onLine !== false &&
              Object.keys(this.read(this.dataKey(accountId, "pending"), {})).length) this.scheduleFlush(this.retryDelay);
        });
      return this.flushing;
    }
  }

  window.EpubDrive = { DriveClient, latestPosition, validPosition, FOLDER_TYPE };
})();
