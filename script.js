/* The Art of Everything — site script.

   Runs once per visit:
   - the mini-player at the bottom of the screen, which plays episodes from
     the podcast's own audio files and remembers where you stopped;
   - page swapping: once the player is in use, links to other pages on the
     site swap the page content in place, so the audio keeps playing.

   Runs on every page (initPage): the year in the footer, news, the TikTok
   embed, and the Episodes page filters. */

const PLAY_ICON =
  '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 1l9 5-9 5z" fill="currentColor"/></svg>';
const PAUSE_ICON =
  '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 1h3v10H2zM7 1h3v10H7z" fill="currentColor"/></svg>';

function formatDate(pubDate, month = "long") {
  const d = new Date(pubDate);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month, day: "numeric" });
}

// News text comes from outside the site, so it's escaped rather than trusted
// as HTML, and only http(s) links are rendered.
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

// localStorage can be missing or blocked (private browsing); the player
// works without it, it just won't remember anything.
const storage = {
  get(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  },
};

/* ==========================================================================
   Mini-player
   ========================================================================== */
const NOW_PLAYING_KEY = "aoe-now-playing"; // the episode in the player
const POSITIONS_KEY = "aoe-positions"; // where you stopped, per episode
const RATES = [1, 1.25, 1.5, 2];

const player = { el: null, audio: null, current: null, pendingTime: 0, dragging: false };

function clock(seconds) {
  if (!isFinite(seconds) || seconds < 0) return "--:--";
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  const m = Math.floor(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}:${(m % 60).toString().padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function buildPlayer() {
  const el = document.createElement("section");
  el.className = "player";
  el.id = "player";
  el.hidden = true;
  el.setAttribute("aria-label", "Episode player");
  el.innerHTML = `
    <div class="container player-inner">
      <span class="player-disc" aria-hidden="true"><img alt="" /></span>
      <div class="player-info">
        <a class="player-title" href="#"></a>
        <div class="player-progress">
          <span class="player-time" data-time="current">0:00</span>
          <input class="player-seek" type="range" min="0" max="0" step="1" value="0" aria-label="Position in episode" />
          <span class="player-time" data-time="duration">--:--</span>
        </div>
      </div>
      <div class="player-controls">
        <button type="button" class="player-btn player-skip" data-skip="-15" aria-label="Back 15 seconds">&minus;15</button>
        <button type="button" class="player-btn player-toggle" aria-label="Play">${PLAY_ICON}</button>
        <button type="button" class="player-btn player-skip" data-skip="30" aria-label="Forward 30 seconds">+30</button>
        <button type="button" class="player-btn player-rate" aria-label="Playback speed">1&times;</button>
        <button type="button" class="player-btn player-close" aria-label="Close player">&times;</button>
      </div>
    </div>
    <audio preload="none"></audio>
  `;
  document.body.appendChild(el);
  player.el = el;
  player.audio = el.querySelector("audio");

  const audio = player.audio;
  const seek = el.querySelector(".player-seek");
  const cur = el.querySelector('[data-time="current"]');
  const dur = el.querySelector('[data-time="duration"]');

  el.querySelector(".player-toggle").addEventListener("click", () => togglePlay());
  el.querySelectorAll(".player-skip").forEach((btn) =>
    btn.addEventListener("click", () => skip(Number(btn.dataset.skip))),
  );
  el.querySelector(".player-rate").addEventListener("click", (e) => {
    const next = RATES[(RATES.indexOf(audio.playbackRate) + 1) % RATES.length] ?? 1;
    audio.playbackRate = next;
    e.currentTarget.textContent = `${next}×`;
    storage.set("aoe-rate", next);
  });
  el.querySelector(".player-close").addEventListener("click", closePlayer);

  seek.addEventListener("input", () => {
    player.dragging = true;
    cur.textContent = clock(Number(seek.value));
  });
  seek.addEventListener("change", () => {
    player.dragging = false;
    if (audio.readyState > 0) audio.currentTime = Number(seek.value);
    else player.pendingTime = Number(seek.value);
  });

  audio.addEventListener("loadedmetadata", () => {
    seek.max = Math.floor(audio.duration) || 0;
    dur.textContent = clock(audio.duration);
    if (player.pendingTime) {
      audio.currentTime = player.pendingTime;
      player.pendingTime = 0;
    }
    audio.playbackRate = storage.get("aoe-rate", 1);
  });

  let lastSave = 0;
  audio.addEventListener("timeupdate", () => {
    if (!player.dragging) {
      seek.value = Math.floor(audio.currentTime);
      cur.textContent = clock(audio.currentTime);
    }
    if (Date.now() - lastSave > 5000) {
      lastSave = Date.now();
      savePosition();
    }
  });

  audio.addEventListener("play", updatePlayState);
  audio.addEventListener("pause", () => {
    savePosition();
    updatePlayState();
  });
  audio.addEventListener("ended", () => {
    savePosition(0);
    updatePlayState();
  });

  if ("mediaSession" in navigator) {
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", () => audio.play());
    ms.setActionHandler("pause", () => audio.pause());
    ms.setActionHandler("seekbackward", () => skip(-15));
    ms.setActionHandler("seekforward", () => skip(30));
  }

  // The rate button shows the remembered speed even before anything plays.
  el.querySelector(".player-rate").textContent = `${storage.get("aoe-rate", 1)}×`;
}

function savePosition(time) {
  const { audio, current } = player;
  if (!current) return;
  const positions = storage.get(POSITIONS_KEY, {});
  positions[current.src] = { t: Math.floor(time ?? audio.currentTime), d: Math.floor(audio.duration) || 0 };
  storage.set(POSITIONS_KEY, positions);
}

function loadEpisode(ep, { autoplay }) {
  const { el, audio } = player;
  const saved = storage.get(POSITIONS_KEY, {})[ep.src];

  if (!player.current || player.current.src !== ep.src) {
    if (player.current) savePosition();
    player.current = ep;
    audio.src = ep.src;
    // Pick up where you left off, unless you'd nearly finished.
    const resume = saved && saved.t > 10 && (!saved.d || saved.t < saved.d - 30) ? saved.t : 0;
    player.pendingTime = resume;
    const seek = el.querySelector(".player-seek");
    seek.max = saved?.d || 0;
    seek.value = resume;
    el.querySelector('[data-time="current"]').textContent = clock(resume);
    el.querySelector('[data-time="duration"]').textContent = saved?.d ? clock(saved.d) : "--:--";
  }

  const title = el.querySelector(".player-title");
  title.textContent = ep.code && ep.code !== "—" ? `${ep.code} · ${ep.title}` : ep.title;
  title.href = ep.href;
  const img = el.querySelector(".player-disc img");
  if (ep.image) img.src = ep.image;
  else img.removeAttribute("src");

  el.hidden = false;
  document.documentElement.classList.add("has-player");
  storage.set(NOW_PLAYING_KEY, ep);

  if ("mediaSession" in navigator && "MediaMetadata" in window) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: ep.title,
      artist: "The Art of Everything",
      artwork: ep.image ? [{ src: ep.image, sizes: "512x512" }] : [],
    });
  }

  if (autoplay) audio.play().catch((err) => console.warn("Playback was blocked:", err));
  updatePlayState();
}

function togglePlay() {
  const { audio } = player;
  if (!player.current) return;
  if (audio.paused) audio.play().catch((err) => console.warn("Playback was blocked:", err));
  else audio.pause();
}

function skip(seconds) {
  const { audio } = player;
  if (audio.readyState === 0) return;
  audio.currentTime = Math.max(0, Math.min(audio.duration || Infinity, audio.currentTime + seconds));
}

function closePlayer() {
  player.audio.pause();
  savePosition();
  player.el.hidden = true;
  document.documentElement.classList.remove("has-player");
  try {
    localStorage.removeItem(NOW_PLAYING_KEY);
  } catch {
    /* ignore */
  }
}

// Keep the page's play buttons and the player's own button in step with
// what's actually playing.
function updatePlayState() {
  const { el, audio, current } = player;
  const playing = Boolean(current) && !audio.paused;
  el.classList.toggle("is-playing", playing);
  const toggle = el.querySelector(".player-toggle");
  toggle.innerHTML = playing ? PAUSE_ICON : PLAY_ICON;
  toggle.setAttribute("aria-label", playing ? "Pause" : "Play");
  if ("mediaSession" in navigator) navigator.mediaSession.playbackState = playing ? "playing" : "paused";

  document.querySelectorAll("[data-play]").forEach((btn) => {
    const isCurrent = current && btn.dataset.src === current.src;
    const isPlaying = isCurrent && playing;
    btn.classList.toggle("is-playing", isPlaying);
    btn.setAttribute("aria-pressed", String(Boolean(isPlaying)));
    if (btn.classList.contains("track-play")) {
      btn.innerHTML = isPlaying ? PAUSE_ICON : PLAY_ICON;
    } else {
      btn.dataset.label ??= btn.innerHTML;
      btn.innerHTML = isPlaying ? "&#10074;&#10074; Pause" : isCurrent ? "&#9654; Resume" : btn.dataset.label;
    }
  });
}

function episodeFromButton(btn) {
  return {
    src: btn.dataset.src,
    title: btn.dataset.title,
    code: btn.dataset.code,
    href: new URL(btn.dataset.href || location.href, location.href).href,
    image: btn.dataset.image,
  };
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-play]");
  if (!btn) return;
  e.preventDefault();
  if (player.current && player.current.src === btn.dataset.src) togglePlay();
  else loadEpisode(episodeFromButton(btn), { autoplay: true });
});

/* ==========================================================================
   Page swapping (keeps audio playing between pages)
   ========================================================================== */
let swappedPath = location.pathname;

function shouldSwap(a, e) {
  if (!player.current || e.defaultPrevented || e.button !== 0) return false;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  if ((a.target && a.target !== "_self") || a.hasAttribute("download")) return false;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return false;
  if (!/(\.html|\/)$/.test(url.pathname)) return false;
  if (url.pathname === location.pathname && url.hash) return false; // link within the page
  return true;
}

document.addEventListener("click", (e) => {
  const a = e.target.closest("a[href]");
  if (!a || !shouldSwap(a, e)) return;
  e.preventDefault();
  goTo(a.href, { push: true });
});

window.addEventListener("popstate", () => {
  if (location.pathname !== swappedPath && history.state?.swapped) goTo(location.href, { push: false });
});

async function goTo(href, { push }) {
  try {
    const res = await fetch(href);
    if (!res.ok) throw new Error(`Page request failed: ${res.status}`);
    const doc = new DOMParser().parseFromString(await res.text(), "text/html");
    if (push) {
      history.replaceState({ swapped: true }, "");
      history.pushState({ swapped: true }, "", href);
    }
    swapPage(doc);
    swappedPath = location.pathname;
    const target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) target.scrollIntoView();
    else window.scrollTo(0, 0);
  } catch (err) {
    console.warn("Falling back to a normal page load:", err);
    location.href = href;
  }
}

function swapPage(doc) {
  document.title = doc.title;
  for (const selector of ['meta[name="description"]', 'link[rel="canonical"]']) {
    const next = doc.head.querySelector(selector);
    const now = document.head.querySelector(selector);
    if (next && now) now.replaceWith(next.cloneNode(true));
  }
  [...document.body.children].forEach((child) => {
    if (child !== player.el) child.remove();
  });
  [...doc.body.children].forEach((child) => {
    if (child.tagName !== "SCRIPT") document.body.insertBefore(document.importNode(child, true), player.el);
  });
  initPage();
  const main = document.getElementById("main");
  if (main) {
    main.setAttribute("tabindex", "-1");
    main.focus({ preventScroll: true });
  }
}

/* ==========================================================================
   Per-page features
   ========================================================================== */
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

// Episodes page: filter by season and search titles and descriptions.
function setupEpisodeFilters() {
  const pills = document.getElementById("season-filters");
  const search = document.getElementById("episode-search");
  if (!pills || !search) return;
  let season = "all";

  function apply() {
    const q = search.value.trim().toLowerCase();
    let any = false;
    document.querySelectorAll("#season-list .season").forEach((section) => {
      let shown = 0;
      section.querySelectorAll(".track").forEach((row) => {
        const show = (season === "all" || row.dataset.season === season) && (!q || row.dataset.search.includes(q));
        row.hidden = !show;
        if (show) shown++;
      });
      section.hidden = shown === 0;
      any ||= shown > 0;
    });
    document.getElementById("episodes-empty").hidden = any;
  }

  pills.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    season = btn.dataset.season;
    pills.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    apply();
  });
  search.addEventListener("input", apply);
}

// Episode pages: "Share" uses the phone's share sheet, or copies the link.
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-share]");
  if (!btn) return;
  const { url, title } = btn.dataset;
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
    } catch {
      /* closed the share sheet */
    }
    return;
  }
  const original = btn.textContent;
  try {
    await navigator.clipboard.writeText(url);
    btn.textContent = "Link copied";
  } catch {
    btn.textContent = "Couldn't copy";
  }
  setTimeout(() => (btn.textContent = original), 2000);
});

function initPage() {
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
  loadTikTokEmbed();
  loadMusicNews();
  loadNewsTeaser();
  setupEpisodeFilters();
  updatePlayState();
}

buildPlayer();
{
  // Bring back the episode you were listening to, paused where you stopped.
  const nowPlaying = storage.get(NOW_PLAYING_KEY, null);
  if (nowPlaying?.src) loadEpisode(nowPlaying, { autoplay: false });
}
initPage();
