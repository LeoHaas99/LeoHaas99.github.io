# EPUB Reader

A private, static EPUB reader for GitHub Pages. Choose or drag an `.epub`, `.kepub`, or `.kepub.epub` file into the page, or connect the Google Drive bookshelf. Kobo EPUBs use the same ZIP-based book container and do not require conversion.

The EPUB file is never uploaded or copied into browser storage. Display preferences, the five most recent titles, and the last EPUB CFI for each exact file are stored in `localStorage`. Supporting Chromium browsers keep an opaque read-only file handle in IndexedDB so a recent book can be reopened directly; browsers never expose or store its local path. The browser may ask for file permission again after a reload.

When connected to Drive, books download directly from Google into memory. Reading positions are saved in Drive's hidden `appDataFolder`; book files are never modified. Positions match the book's SHA-256 fingerprint, including when the same file is opened locally. Access tokens stay in memory. Pending progress is kept locally per Google account and retried after reconnecting. Opening or resizing a book does not overwrite cloud progress; the latest timestamped reading update wins, including deliberate jumps backwards. Keep device clocks accurate. A newer position found while a book is open is offered with **Resume there** / **Keep reading here**.

## Controls

- Use the on-screen arrows, `ArrowLeft` / `ArrowRight`, or `ArrowUp` / `ArrowDown` to change pages.
- Press `Space` for the next page and `Shift+Space` for the previous page.
- Use the contents button to navigate chapters.
- Use the top-bar search button to find matching text throughout the book and jump to any result.
- The footer shows chapter screen count, full-book percentage, full-book virtual page count, and overall progress. Its slider seeks after locations have been calculated.
- The recent-books button lists the latest five books. In browsers with persistent file-handle support, selecting one reopens it directly.
- Font size (80–300%), reader width (50–100%), theme, and each book's latest position are remembered on this browser and site.

## Hosting

The reader has no build step or server component. Its pinned copies of epub.js and JSZip live in `vendor/`, so the entire folder can be served directly by GitHub Pages.

DRM-protected EPUBs, bookmarks, annotations, and permanent storage of the EPUB itself are not supported.

## Google Cloud setup

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/) and enable **Google Drive API** under **APIs & Services → Library**. Google Picker API is not needed; the reader has its own folder browser.
2. In **Google Auth Platform → Branding**, set an app name (for example, *EPUB Reader*), support email, and contact email. Choose **External** audience. Start in **Testing** and add your Google account under **Audience → Test users**.
3. Under **Data Access**, add exactly these scopes:
   - `https://www.googleapis.com/auth/drive.readonly` — list folders and download books. Google grants read access to the whole Drive; the bookshelf displays the folder you select.
   - `https://www.googleapis.com/auth/drive.appdata` — read and write the reader's own hidden progress and folder settings.
4. Under **Clients**, create an OAuth client of type **Web application**. Add `https://leohaas99.github.io` under **Authorized JavaScript origins** (origin only, no `/epub-reader/` path). For local development, also add `http://localhost:4185`. This popup flow does not need redirect URIs.
5. Copy the public client ID ending in `.apps.googleusercontent.com` into `googleClientId` in `config.js`. Do not add a client secret, service-account key, or access token. No API key is required. Bump the service-worker cache version when changing the configuration and deploy the reader.
6. In the reader, open **Google Drive bookshelf → Connect Google Drive**, allow both permissions, browse to **Rakuten Kobo**, and select **Use this folder**. Connect the same account on your other device; the selected folder and positions are shared.

In Testing, Google test-user consent expires after seven days. Short-lived access tokens also mean the browser may need a **Reconnect** click during normal use. Personal-use apps can qualify for Google's verification exception; broader distribution with `drive.readonly` requires reviewing restricted-scope verification requirements. The app remains usable locally without Google configuration or authorization.

Personal reading usage should stay well within Google's standard no-extra-charge thresholds; no paid server is used. See [current Drive API usage limits](https://developers.google.com/workspace/drive/api/guides/limits) for the applicable quotas and billing thresholds.

References: [OAuth client setup](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid), [browser token flow](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [app-data storage](https://developers.google.com/workspace/drive/api/guides/appdata), [testing audience](https://support.google.com/cloud/answer/15549945), [personal-use verification exception](https://support.google.com/cloud/answer/13464323).

## Install and use offline

Use **Install Reader** on the start screen when offered, or expand the installation instructions for your browser. On iPhone/iPad, use Safari → Share → Add to Home Screen; on supported desktop browsers, use the browser's install command (Safari: File → Add to Dock).

After the first successful online visit and offline setup, the reader can open without a connection. Book files must still be available locally and may need to be selected again; opening a book from Drive requires a connection. Installation itself does not store books or connect Google Drive. Progress waits locally while offline and syncs when Drive is connected again; web lookups require a connection.

The manifest and service worker are scoped to `/epub-reader/`. When changing a reader asset, bump `CACHE_VERSION` in `sw.js` so the next visit downloads the new release. Updates activate after all reader tabs/windows are closed. For local testing, serve over `http://localhost` rather than opening `index.html` directly.
