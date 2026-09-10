# Art of Artists — Website Design

## Overview
Static site (plain HTML/CSS/JS, no build tools/framework) for the "Art of Artists" podcast — two brothers discussing what inspires famous musicians and whether success comes from talent or luck.

- **RSS feed:** https://anchor.fm/s/b5fbd7e4/podcast/rss (CORS-enabled — fetched client-side)
- **Distribution:** Spotify, Apple Podcasts
- **Live site:** https://rockinrupe.github.io/art-of-artists-podcast/
- **Repo:** https://github.com/RockinRupe/art-of-artists-podcast (public — required for free GitHub Pages)
- **Local preview:** `python -m http.server 5500` (configured in `.claude/launch.json`)

## Tech stack
- Plain HTML/CSS/JS, no build step
- Hosting: GitHub Pages, served from `main` branch root

## Pages
| File | Purpose | Status |
|---|---|---|
| `index.html` | Home — hero, listen buttons, 5 latest episodes, about blurb | Episodes load dynamically from RSS feed via `script.js` (falls back to static markup if fetch fails) |
| `merch.html` | Merch storefront | Placeholder products (3 cards) |
| `socials.html` | Social links + live embeds | Instagram, YouTube, TikTok all real, with live embedded widgets. No X/Twitter — not used |
| `recommendations.html` | Other podcasts/artists/gear recommended by the hosts | Placeholder cards, content TBD |

Shared: `styles.css` (dark theme, nav bar, card grid, buttons), `script.js` (footer year, dynamic episode fetch/render, TikTok oEmbed loader).

### Social embed implementation notes
- **YouTube**: plain iframe using the "uploads playlist" trick — swap `UC` prefix of the channel ID for `UU` (`UU8Jtier-9QXvPouDwtcjJEQ`) and embed as `videoseries?list=...`. Always shows latest upload, no API key needed.
- **Instagram**: plain iframe to `instagram.com/{username}/embed/` — legacy public profile embed, still functional despite being unofficial/undocumented today. No API key needed, but could break if Meta removes it.
- **TikTok**: official oEmbed flow — fetch `https://www.tiktok.com/oembed?url=...` client-side (in `script.js`), inject the returned HTML, then load `https://www.tiktok.com/embed.js`. A static hardcoded blockquote does NOT work — it must be the exact markup returned by the oEmbed call. Falls back to a plain "View on TikTok" link if the fetch fails.

## Open items / TODOs
- [x] Real Spotify show URL + embedded player (index.html)
- [x] Real Apple Podcasts show URL + embedded player (index.html)
- [x] Socials: Instagram, YouTube, TikTok all real; X/Twitter intentionally omitted
- [x] Live social embeds (YouTube, Instagram, TikTok) on socials.html
- [ ] Merch: confirm store platform (Shopify/Teespring/etc.) and real product names/images/links, or mark "not live yet"
- [ ] Recommendations: decide actual content (other podcasts? artists? books/gear?) and populate
- [ ] Optional: custom `.com` domain (requires repo to stay public on free GitHub Pages, or GitHub Pro for private)
