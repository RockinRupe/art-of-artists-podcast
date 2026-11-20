document.getElementById("year").textContent = new Date().getFullYear();

const RSS_FEED_URL = "https://anchor.fm/s/b5fbd7e4/podcast/rss";
const EPISODE_COUNT = 8;
const SPOTIFY_SHOW_URL = "https://open.spotify.com/show/3cyXQL4kBuqOkCgAFvwczI";
const PLAY_ICON =
  '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 1l9 5-9 5z" fill="currentColor"/></svg>';

function formatDate(pubDate, month = "long") {
  const d = new Date(pubDate);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month, day: "numeric" });
}

function isoDate(pubDate) {
  const d = new Date(pubDate);
  return isNaN(d) ? "" : d.toISOString().slice(0, 10);
}

function stripHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || "").trim();
}

// Feed and news text comes from outside the site, so it's escaped rather than
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

/* ---------- Episodes ----------
   Seasons are shown as sides of a record: season 1 is Side A, season 2 is
   Side B. Episode numbers come from the feed's itunes:season/itunes:episode
   tags when present, otherwise from the title ("Title | 2.2", "S1E10 Queen",
   "S1 Finale - Post Malone"), and the number is taken out of the title. */
function parseEpisode(item) {
  const tag = (name) => item.getElementsByTagName(name)[0]?.textContent?.trim() ?? "";
  let title = tag("title") || "Untitled episode";
  let season = parseInt(tag("itunes:season"), 10) || null;
  let number = parseInt(tag("itunes:episode"), 10) || null;
  let finale = false;
  let m;

  if ((m = title.match(/^(.*?)\s*\|\s*(\d+)\.(\d+)\s*$/))) {
    title = m[1];
    season ??= +m[2];
    number ??= +m[3];
  } else if ((m = title.match(/^S(\d+)E(\d+)\s*[-–:]?\s*(.+)$/i))) {
    season ??= +m[1];
    number ??= +m[2];
    title = m[3];
  } else if ((m = title.match(/^S(\d+)\s+Finale\s*[-–:]\s*(.+)$/i))) {
    season ??= +m[1];
    finale = number === null;
    title = `Season ${m[1]} Finale: ${m[2]}`;
  }

  const pubDate = tag("pubDate");
  return {
    title,
    season,
    number,
    finale,
    link: safeUrl(tag("link") || SPOTIFY_SHOW_URL),
    date: formatDate(pubDate, "short"),
    iso: isoDate(pubDate),
    description: stripHtml(tag("description")),
  };
}

// An episode with no number in the feed or title, right after a numbered one
// in the same season, is taken to be the next track (e.g. B2 then B3).
function fillMissingNumbers(episodes) {
  for (let i = episodes.length - 2; i >= 0; i--) {
    const ep = episodes[i];
    const older = episodes[i + 1];
    if (ep.season === null && ep.number === null && !ep.finale && older.number !== null) {
      ep.season = older.season;
      ep.number = older.number + 1;
    }
  }
  return episodes;
}

function sideLetter(season) {
  return season ? String.fromCharCode(64 + season) : "";
}

function trackCode(ep) {
  const side = sideLetter(ep.season);
  if (!side) return "—";
  if (ep.finale) return `${side}·FIN`;
  return ep.number !== null ? `${side}${ep.number}` : side;
}

function renderTrack(ep, isLatest) {
  const title = escapeHtml(ep.title);
  const desc = ep.description.length > 260 ? `${ep.description.slice(0, 257)}…` : ep.description;
  return `
    <li class="track${isLatest ? " is-latest" : ""}">
      <span class="track-num">${escapeHtml(trackCode(ep))}</span>
      <div class="track-body">
        <h3 class="track-title"><a href="${escapeHtml(ep.link)}" target="_blank" rel="noopener">${title}</a></h3>
        ${desc ? `<p class="track-desc">${escapeHtml(desc)}</p>` : ""}
      </div>
      <time class="track-date" datetime="${ep.iso}">${ep.date}</time>
      <a class="track-play" href="${escapeHtml(ep.link)}" target="_blank" rel="noopener" aria-label="Play ${title}">${PLAY_ICON}</a>
    </li>
  `;
}

function renderLatest(ep) {
  const side = sideLetter(ep.season);
  const where = side
    ? ep.finale
      ? `Side ${side}, finale`
      : ep.number !== null
        ? `Side ${side}, track ${ep.number}`
        : `Side ${side}`
    : "";
  const meta = ["New", where, ep.date].filter(Boolean).join(" · ");
  const code = trackCode(ep);

  document.getElementById("latest-meta").textContent = meta;
  document.getElementById("latest-title").innerHTML =
    `<a href="${escapeHtml(ep.link)}" target="_blank" rel="noopener">${escapeHtml(ep.title)}</a>`;
  document.getElementById("latest-desc").textContent =
    ep.description.length > 220 ? `${ep.description.slice(0, 217)}…` : ep.description;
  document.getElementById("latest-sticker").textContent = code === "—" ? "New" : `New · ${code}`;
}

async function loadEpisodes() {
  const list = document.getElementById("episode-list");
  if (!list) return;

  try {
    const res = await fetch(RSS_FEED_URL);
    if (!res.ok) throw new Error(`Feed request failed: ${res.status}`);

    const xml = new DOMParser().parseFromString(await res.text(), "application/xml");
    if (xml.querySelector("parsererror")) throw new Error("Feed did not parse as XML");

    const items = [...xml.querySelectorAll("item")];
    if (items.length === 0) throw new Error("No episodes found in feed");

    const episodes = fillMissingNumbers(items.map(parseEpisode)).slice(0, EPISODE_COUNT);
    list.innerHTML = episodes.map((ep, i) => renderTrack(ep, i === 0)).join("");
    if (document.getElementById("latest")) renderLatest(episodes[0]);
  } catch (err) {
    console.warn("Could not load live episodes, showing fallback list:", err);
  }
}

/* ---------- TikTok (About page) ---------- */
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

/* ---------- Music news ---------- */
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

async function fetchNews() {
  const res = await fetch(MUSIC_NEWS_URL, { cache: "no-cache" });
  if (!res.ok) throw new Error(`News request failed: ${res.status}`);
  return res.json();
}

// Most feeds use the headline (plus the outlet's name) as the summary.
// Showing it twice adds nothing, so those summaries are dropped.
function repeatsTitle(summary, title) {
  const norm = (s) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const s = norm(summary);
  const t = norm(title);
  return !s || s.startsWith(t.slice(0, 40)) || s.includes(t);
}

function renderNewsItem(story) {
  const tags = [
    ...story.artists,
    ...story.categories.filter((c) => NEWS_TAG_LABELS[c]).map((c) => NEWS_TAG_LABELS[c]),
  ];
  const summary = repeatsTitle(story.summary, story.title) ? "" : story.summary;
  return `
    <li class="story">
      <div class="story-meta">
        <span class="story-date">${story.published ? formatDate(story.published, "short") : "Recent"}</span>
        <span>${escapeHtml(story.source)}</span>
      </div>
      <h3><a href="${escapeHtml(safeUrl(story.link))}" target="_blank" rel="noopener">${escapeHtml(story.title)}</a></h3>
      ${summary ? `<p>${escapeHtml(summary)}</p>` : ""}
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
    const data = await fetchNews();
    stories = data.stories ?? [];
    const when = new Date(data.generated_at);
    if (!isNaN(when)) {
      updated.textContent = `Last updated ${when.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`;
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

  // Only offer filters that have stories behind them. When every story is
  // about a followed artist, "Artists We Follow" would just repeat "All".
  const everyStoryFollowed = stories.every((s) => s.artists.length > 0);
  filters.innerHTML = NEWS_FILTERS.filter(([key]) => stories.some((s) => matches(s, key)))
    .filter(([key]) => !(key === "watchlist" && everyStoryFollowed))
    .map(([key, label]) => `<button type="button" data-key="${key}">${label}</button>`)
    .join("");
  filters.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (btn) show(btn.dataset.key);
  });
  show("all");
}

// Home page "In the news" tile: the newest story for each of a few different
// artists, so one busy artist can't fill the whole tile.
async function loadNewsTeaser() {
  const list = document.getElementById("news-teaser");
  if (!list) return;

  try {
    const { stories = [] } = await fetchNews();
    const seen = new Set();
    const picks = [];
    for (const story of stories) {
      const artist = story.artists[0];
      if (!artist || seen.has(artist)) continue;
      seen.add(artist);
      picks.push(story);
      if (picks.length === 3) break;
    }
    if (picks.length === 0) return;

    list.innerHTML = picks
      .map(
        (s) => `
        <li>
          <span>${escapeHtml(s.artists[0])}</span>
          <a href="${escapeHtml(safeUrl(s.link))}" target="_blank" rel="noopener">${escapeHtml(s.title)}</a>
        </li>`,
      )
      .join("");
  } catch (err) {
    console.warn("Could not load news teaser:", err);
  }
}

loadEpisodes();
loadTikTokEmbed();
loadMusicNews();
loadNewsTeaser();
