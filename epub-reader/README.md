# EPUB Reader

A private, static EPUB reader for GitHub Pages. Choose or drag an `.epub` file into the page to read it locally in the browser.

The EPUB file is never uploaded or retained. Display preferences and the last EPUB CFI for each exact file are stored in the browser's `localStorage`; select the same file again to return to that position.

## Controls

- Use the on-screen arrows or `ArrowLeft` / `ArrowRight` to change pages.
- Press `Space` for the next page and `Shift+Space` for the previous page.
- Use the contents button to navigate chapters.
- The bottom slider seeks through the book after locations have been calculated.
- Font size, theme, and each book's latest position are remembered on this browser and site.

## Hosting

The reader has no build step or server component. Its pinned copies of epub.js and JSZip live in `vendor/`, so the entire folder can be served directly by GitHub Pages.

DRM-protected EPUBs are not supported. Bookmarks, annotations, text search, and permanent storage of the EPUB itself are outside the first version.
