# Something To Do

This is a small static app for GitHub Pages. It is meant for the moment when you are bored and do not know what to do. Edit `data.json` on GitHub, save the change, and the page will show the updated ideas on the next load.

## Files

- `index.html` is the page.
- `styles.css` controls the mobile-first design.
- `app.js` loads the data and shows one immediate suggestion.
- `data.json` is the file you edit.

## Editing the list

Keep `Lesen` as the first and main section by adding books under:

```json
"reading": {
  "books": [
    {
      "title": "Book title",
      "author": "Author name",
      "note": "Optional note",
      "mood": "Optional short tag"
    }
  ]
}
```

Games go in `videoGames`. Movies and shows go in `moviesAndShows`. They are intentionally less prominent than reading.
Optional fields can be left out or set to an empty string.

```json
"videoGames": [
  {
    "title": "Game title",
    "platform": "Optional platform",
    "note": "Optional note",
    "mood": "Optional short tag"
  }
],
"moviesAndShows": [
  {
    "title": "Movie or show title",
    "platform": "Optional type or platform",
    "director": "Optional director",
    "note": "Optional note",
    "mood": "Optional short tag"
  }
]
```

To remove something, delete its object from `data.json`.

To archive something manually, move it into `archive` like this:

```json
{
  "title": "Finished item",
  "type": "Book"
}
```

## GitHub Pages

Upload this folder to a GitHub repository and enable GitHub Pages for the branch that contains it.

GitHub Pages cannot run a normal SQLite database because it only hosts static files. A real add/archive form would need either GitHub API authentication, a small backend, or a service such as Supabase. For this version, `data.json` is the simple editable source of truth.
