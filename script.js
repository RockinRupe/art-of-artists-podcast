document.getElementById("year").textContent = new Date().getFullYear();

const RSS_FEED_URL = "https://anchor.fm/s/b5fbd7e4/podcast/rss";
const EPISODE_COUNT = 5;

function formatDate(pubDate) {
  const d = new Date(pubDate);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function stripHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || "").trim();
}

async function loadEpisodes() {
  const list = document.getElementById("episode-list");
  if (!list) return;

  try {
    const res = await fetch(RSS_FEED_URL);
    if (!res.ok) throw new Error(`Feed request failed: ${res.status}`);

    const xml = new DOMParser().parseFromString(await res.text(), "application/xml");
    if (xml.querySelector("parsererror")) throw new Error("Feed did not parse as XML");

    const items = [...xml.querySelectorAll("item")].slice(0, EPISODE_COUNT);
    if (items.length === 0) throw new Error("No episodes found in feed");

    list.innerHTML = items
      .map((item) => {
        const title = item.querySelector("title")?.textContent ?? "Untitled episode";
        const link = item.querySelector("link")?.textContent ?? "#";
        const pubDate = formatDate(item.querySelector("pubDate")?.textContent ?? "");
        const rawDescription = item.querySelector("description")?.textContent ?? "";
        const description = stripHtml(rawDescription).slice(0, 240);

        return `
          <li class="episode">
            <div class="episode-meta">
              <span class="episode-date">${pubDate}</span>
            </div>
            <h3><a href="${link}" target="_blank" rel="noopener">${title}</a></h3>
            <p>${description}${description.length === 240 ? "…" : ""}</p>
          </li>
        `;
      })
      .join("");
  } catch (err) {
    console.warn("Could not load live episodes, showing fallback list:", err);
  }
}

const TIKTOK_PROFILE_URL = "https://www.tiktok.com/@artofartistspod";

async function loadTikTokEmbed() {
  const container = document.getElementById("tiktok-embed-container");
  if (!container) return;

  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(TIKTOK_PROFILE_URL)}`);
    if (!res.ok) throw new Error(`oEmbed request failed: ${res.status}`);

    const data = await res.json();
    container.innerHTML = data.html;

    const script = document.createElement("script");
    script.src = "https://www.tiktok.com/embed.js";
    script.async = true;
    document.body.appendChild(script);
  } catch (err) {
    console.warn("Could not load TikTok embed, showing fallback link:", err);
    container.innerHTML = `<a class="btn" href="${TIKTOK_PROFILE_URL}" target="_blank" rel="noopener">View on TikTok</a>`;
  }
}

// Written by scraper/music_news.py — see scraper/README.md.
const MUSIC_NEWS_URL = "data/music-news.json";
const NEWS_FILTERS = [
  ["all", "All"],
  ["watchlist", "Artists We Follow"],
  ["new_release", "New Releases"],
  ["death", "Tributes"],
  ["tour", "Tours"],
  ["awards_charts", "Awards & Charts"],
  ["legal_drama", "Drama"],
];
const NEWS_TAG_LABELS = Object.fromEntries(NEWS_FILTERS.slice(2));

// Story text comes from third-party feeds, so it's escaped rather than
// trusted as HTML, and only http(s) links are rendered.
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : "#";
  } catch {
    return "#";
  }
}

function renderNewsItem(story) {
  const tags = [
    ...story.artists,
    ...story.categories.filter((c) => NEWS_TAG_LABELS[c]).map((c) => NEWS_TAG_LABELS[c]),
  ];
  return `
    <li class="episode">
      <div class="episode-meta">
        <span class="episode-date">${story.published ? formatDate(story.published) : "Recent"}</span>
        <span class="news-source">${escapeHtml(story.source)}</span>
      </div>
      <h3><a href="${escapeHtml(safeUrl(story.link))}" target="_blank" rel="noopener">${escapeHtml(story.title)}</a></h3>
      ${story.summary ? `<p>${escapeHtml(story.summary)}</p>` : ""}
      ${tags.length ? `<div class="news-tags">${tags.map((t) => `<span>${escapeHtml(t)}</span>`).join("")}</div>` : ""}
    </li>
  `;
}

async function loadMusicNews() {
  const list = document.getElementById("news-list");
  if (!list) return;
  const filters = document.getElementById("news-filters");
  const updated = document.getElementById("news-updated");

  let stories;
  try {
    const res = await fetch(MUSIC_NEWS_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error(`News request failed: ${res.status}`);
    const data = await res.json();
    stories = data.stories ?? [];
    const when = new Date(data.generated_at);
    if (!isNaN(when)) {
      updated.textContent = `Updated ${when.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`;
    }
  } catch (err) {
    console.warn("Could not load music news:", err);
    stories = [];
  }
  if (stories.length === 0) {
    list.innerHTML = `<li class="news-empty">No news yet — check back soon.</li>`;
    return;
  }

  const matches = (story, key) =>
    key === "all" || (key === "watchlist" ? story.artists.length > 0 : story.categories.includes(key));

  function show(key) {
    const shown = stories.filter((s) => matches(s, key));
    list.innerHTML = shown.length
      ? shown.map(renderNewsItem).join("")
      : `<li class="news-empty">Nothing in this category right now.</li>`;
    filters.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.key === key));
  }

  // Only offer filters that have stories behind them.
  filters.innerHTML = NEWS_FILTERS.filter(([key]) => stories.some((s) => matches(s, key)))
    .map(([key, label]) => `<button type="button" data-key="${key}">${label}</button>`)
    .join("");
  filters.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (btn) show(btn.dataset.key);
  });
  show("all");
}

loadEpisodes();
loadTikTokEmbed();
loadMusicNews();
