# Music News Scraper

Gathers recent music news for show prep: new releases, deaths and tributes,
tours, awards and charts, legal drama, and anything mentioning artists on your
watchlist.

It reads the public RSS feeds of music publications (Pitchfork, Rolling Stone,
Billboard, Stereogum, NME, Consequence) plus Google News searches. It does not
scrape HTML, so it won't break when a site redesigns. It only needs the Python
standard library, with nothing to install.

## Run it

```bash
python scraper/music_news.py                       # last 7 days, everything
python scraper/music_news.py --days 3              # shorter window
python scraper/music_news.py --category death      # only deaths/tributes
python scraper/music_news.py --artist "SZA" --watchlist-only
```

Output goes to `data/`:

- `music-news.md` is a readable digest grouped by watchlist artist, then by category.
- `music-news.json` holds the same stories as structured data (title, link, source,
  date, summary, categories, matched artists), plus any feeds that failed. A
  web page could load this file later.

## Customize: `scraper/config.json`

| Key | What it does |
| --- | --- |
| `watchlist` | Artists to track. Each one also gets its own Google News search. |
| `feeds` | RSS/Atom feeds to read. Add `"category": "new_release"` to force a category for every story in a feed. |
| `categories` | Regex patterns matched against headlines to tag stories. Add a new key to create a new category. |
| `days` | Default look-back window. |
| `search_watchlist_on_google_news` | Set to `false` to skip the per-artist searches. |

Categories are matched against the **headline only**. This keeps false positives
down. For example, "Grateful Dead" doesn't count as a death, and neither does
"…who died in 1995" in a reissue story's summary. If the same story appears in
two feeds, it's listed once.

## Tests

```bash
python -m unittest discover -s scraper/tests -v
```
