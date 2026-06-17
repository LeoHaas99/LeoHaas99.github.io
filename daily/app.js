const DATA_URL = "data.json";

const elements = {
  suggestion: document.querySelector("#suggestion"),
  reading: document.querySelector("#reading"),
  games: document.querySelector("#games"),
  watching: document.querySelector("#watching"),
  archive: document.querySelector("#archive"),
  error: document.querySelector("#error"),
};

const itemCountLabel = (count, singular, plural) =>
  `${count} ${count === 1 ? singular : plural}`;

const escapeText = (value) => {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
};

const renderHeader = (title, countText) => `
  <div class="section-header">
    <h2 class="section-title">${escapeText(title)}</h2>
    <span class="count">${escapeText(countText)}</span>
  </div>
`;

const renderEmpty = (message) => `<p class="empty">${escapeText(message)}</p>`;

const compactDetails = (details) =>
  details.map((detail) => `${detail ?? ""}`.trim()).filter(Boolean).join(" / ");

const renderMeta = (details) => {
  const meta = compactDetails(details);

  return meta ? `<span class="meta">${escapeText(meta)}</span>` : "";
};

const renderMoodTag = (mood) => {
  const moodText = compactDetails([mood]);

  return moodText ? `<span class="tag">${escapeText(moodText)}</span>` : "";
};

const renderNote = (note) => {
  const noteText = compactDetails([note]);

  return noteText ? `<p class="note">${escapeText(noteText)}</p>` : "";
};

const buildSuggestionPool = (data) => {
  const books = (data.reading?.books || []).map((item) => ({
    ...item,
    category: "Lesen",
    detail: compactDetails([item.author, item.mood, item.note]) || "Pick up a book for 10 minutes.",
  }));
  const games = (data.videoGames || []).map((item) => ({
    ...item,
    category: "Play",
    detail: compactDetails([item.platform, item.mood, item.note]) || "Play one small session.",
  }));
  const watching = (data.moviesAndShows || []).map((item) => ({
    ...item,
    category: "Watch",
    detail:
      compactDetails([
        item.platform,
        item.director ? `Director: ${item.director}` : "",
        item.mood,
        item.note,
      ]) ||
      "Watch one episode or start the movie.",
  }));

  return [...books, ...games, ...watching];
};

const renderSuggestion = (data) => {
  const pool = buildSuggestionPool(data);

  if (!pool.length) {
    elements.suggestion.innerHTML = `
      <p class="suggestion-label">Right now</p>
      <strong class="suggestion-title">Add one thing you actually want to do.</strong>
      <span class="suggestion-meta">Start in data.json. Future-you will be grateful.</span>
    `;
    return;
  }

  const readingFirstPool = pool.sort((a, b) => {
    if (a.category === "Lesen" && b.category !== "Lesen") return -1;
    if (a.category !== "Lesen" && b.category === "Lesen") return 1;
    return 0;
  });
  const suggestion = readingFirstPool[0];

  elements.suggestion.innerHTML = `
    <p class="suggestion-label">Try this now</p>
    <strong class="suggestion-title">${escapeText(suggestion.title)}</strong>
    <span class="suggestion-meta">${escapeText(suggestion.category)} &middot; ${escapeText(suggestion.detail)}</span>
  `;
};

const renderBooks = (books = []) => {
  const list = books
    .map(
      (book) => `
        <li class="book-item">
          <strong class="book-title">${escapeText(book.title)}</strong>
          ${renderMeta([book.author])}
          ${renderNote(book.note)}
          ${renderMoodTag(book.mood)}
        </li>
      `,
    )
    .join("");

  elements.reading.innerHTML = `
    ${renderHeader("Reading", itemCountLabel(books.length, "book", "books"))}
    ${books.length ? `<ul class="item-list">${list}</ul>` : renderEmpty("Add books for bored days in data.json.")}
  `;
};

const renderSimpleList = (target, title, items = [], emptyMessage, options = {}) => {
  const list = items
    .map(
      (item) => `
        <li class="media-item">
          <strong class="media-title">${escapeText(item.title)}</strong>
          ${renderMeta([
            item.platform,
            options.showDirector && item.director ? ` ${item.director}` : "",
          ])}
          ${renderNote(item.note)}
          ${renderMoodTag(item.mood)}
        </li>
      `,
    )
    .join("");

  target.innerHTML = `
    ${renderHeader(title, itemCountLabel(items.length, "item", "items"))}
    ${items.length ? `<ul class="item-list">${list}</ul>` : renderEmpty(emptyMessage)}
  `;
};

const renderArchive = (archive = []) => {
  if (!archive.length) {
    elements.archive.innerHTML = "";
    return;
  }

  const archivedItems = archive
    .map(
      (item) => `
        <li class="media-item">
          <strong class="media-title">${escapeText(item.title)}</strong>
          ${renderMeta([item.type || "Archived", item.director ? `Director: ${item.director}` : ""])}
          ${renderMoodTag(item.mood)}
        </li>
      `,
    )
    .join("");

  elements.archive.innerHTML = `
    <details>
      <summary>Archive (${archive.length})</summary>
      <ul class="item-list">${archivedItems}</ul>
    </details>
  `;
};

const renderApp = (data) => {
  renderSuggestion(data);
  renderBooks(data.reading?.books || []);
  renderSimpleList(
    elements.games,
    "If reading is not it",
    data.videoGames || [],
    "Add games for low-energy evenings in data.json.",
  );
  renderSimpleList(
    elements.watching,
    "Things you wanted to watch",
    data.moviesAndShows || [],
    "Add movies or shows for indecisive nights in data.json.",
    { showDirector: true },
  );
  renderArchive(data.archive || []);
};

const loadData = async () => {
  try {
    const response = await fetch(`${DATA_URL}?v=${Date.now()}`, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Could not load ${DATA_URL}.`);
    }

    const data = await response.json();
    renderApp(data);
  } catch (error) {
    elements.error.hidden = false;
    elements.error.textContent =
      "I could not load the hobby data. Check that data.json exists and is valid JSON.";
    console.error(error);
  }
};

loadData();
