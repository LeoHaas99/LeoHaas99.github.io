# EPUB Reader

A private, static EPUB reader for GitHub Pages. Choose or drag an `.epub`, `.kepub`, or `.kepub.epub` file into the page to read it locally in the browser. Kobo EPUBs use the same ZIP-based book container and do not require conversion.

The EPUB file is never uploaded or copied into browser storage. Display preferences, the five most recent titles, and the last EPUB CFI for each exact file are stored in `localStorage`. Supporting Chromium browsers keep an opaque read-only file handle in IndexedDB so a recent book can be reopened directly; browsers never expose or store its local path. The browser may ask for file permission again after a reload.

## Controls

- Use the on-screen arrows, `ArrowLeft` / `ArrowRight`, or `ArrowUp` / `ArrowDown` to change pages.
- Press `Space` for the next page and `Shift+Space` for the previous page.
- Use the contents button to navigate chapters.
- The footer shows chapter screen count, full-book percentage, full-book virtual page count, and overall progress. Its slider seeks after locations have been calculated.
- The recent-books button lists the latest five books. In browsers with persistent file-handle support, selecting one reopens it directly.
- Font size (80–300%), reader width (50–100%), theme, and each book's latest position are remembered on this browser and site.

## Hosting

The reader has no build step or server component. Its pinned copies of epub.js and JSZip live in `vendor/`, so the entire folder can be served directly by GitHub Pages.

DRM-protected EPUBs are not supported. Bookmarks, annotations, text search, and permanent storage of the EPUB itself are outside the first version.
