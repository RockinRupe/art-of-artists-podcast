# Art of Artists — Website Design

## Overview
Static site (plain HTML/CSS/JS, no build tools/framework) for the "Art of Artists" podcast — two brothers discussing what inspires famous musicians and whether success comes from talent or luck.

- **RSS feed:** https://anchor.fm/s/b5fbd7e4/podcast/rss
- **Distribution:** Spotify, Apple Podcasts
- **Local preview:** `python -m http.server 5500` (configured in `.claude/launch.json`)

## Tech stack
- Plain HTML/CSS/JS, no build step
- Hosting plan (discussed, not yet done): GitHub Pages or similar static host

## Pages
| File | Purpose | Status |
|---|---|---|
| `index.html` | Home — hero, listen buttons, 5 latest episodes, about blurb | Episode content pulled from real RSS feed |
| `merch.html` | Merch storefront | Placeholder products (3 cards) |
| `socials.html` | Social links | Placeholder handles (Instagram, TikTok, X, YouTube) |
| `recommendations.html` | Other podcasts/artists/gear recommended by the hosts | Placeholder cards, content TBD |

Shared: `styles.css` (dark theme, nav bar, card grid, buttons), `script.js` (footer year).

## Open items / TODOs
- [ ] Real Spotify show URL (index.html listen button)
- [ ] Real Apple Podcasts show URL (index.html listen button)
- [ ] Merch: confirm store platform (Shopify/Teespring/etc.) and real product names/images/links, or mark "not live yet"
- [ ] Socials: real handles/links for Instagram, TikTok, X, YouTube (or drop platforms that don't apply)
- [ ] Recommendations: decide actual content (other podcasts? artists? books/gear?) and populate
- [ ] Decide hosting (GitHub Pages recommended — free, simple for static sites)
- [ ] Optional: automate episode list from RSS feed instead of hardcoding
