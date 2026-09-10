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

loadEpisodes();
