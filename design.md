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
| `socials.html` | Social links | Instagram + YouTube are real (pulled from show notes in RSS feed); TikTok + X still placeholders |
| `recommendations.html` | Other podcasts/artists/gear recommended by the hosts | Placeholder cards, content TBD |

Shared: `styles.css` (dark theme, nav bar, card grid, buttons), `script.js` (footer year, dynamic episode fetch/render).

## Open items / TODOs
- [ ] Real Spotify show URL (index.html listen button)
- [ ] Real Apple Podcasts show URL (index.html listen button)
- [ ] Merch: confirm store platform (Shopify/Teespring/etc.) and real product names/images/links, or mark "not live yet"
- [ ] Socials: real TikTok and X links (Instagram + YouTube already done)
- [ ] Recommendations: decide actual content (other podcasts? artists? books/gear?) and populate
- [ ] Optional: custom `.com` domain (requires repo to stay public on free GitHub Pages, or GitHub Pro for private)
