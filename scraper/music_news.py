#!/usr/bin/env python3
"""Music news scraper for Art of Artists.

Pulls RSS/Atom feeds from music publications (plus Google News searches for
each watchlist artist), tags every story by category (deaths, new releases,
tours, awards/charts, legal/drama) and by watchlist artist, de-duplicates it,
and writes the results to JSON and a readable Markdown digest.

Standard library only, so it runs anywhere Python 3.9+ is installed:

    python scraper/music_news.py
    python scraper/music_news.py --days 3 --category death
    python scraper/music_news.py --artist "Radiohead" --artist "SZA"
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Callable, Iterable

ROOT = Path(__file__).resolve().parent
DEFAULT_CONFIG = ROOT / "config.json"
DEFAULT_OUT_DIR = ROOT.parent / "data"
USER_AGENT = "Mozilla/5.0 (compatible; ArtOfArtistsNewsBot/1.0)"

CATEGORY_LABELS = {
    "death": "Deaths & Tributes",
    "new_release": "New Releases",
    "tour": "Tours & Festivals",
    "awards_charts": "Awards & Charts",
    "legal_drama": "Legal & Drama",
    "watchlist": "Watchlist Artists",
    "other": "Other News",
}

ATOM = "{http://www.w3.org/2005/Atom}"


@dataclass
class Story:
    title: str
    link: str
    source: str
    published: str | None
    summary: str = ""
    categories: list[str] = field(default_factory=list)
    artists: list[str] = field(default_factory=list)


# --------------------------------------------------------------------------
# Fetching and parsing
# --------------------------------------------------------------------------

def fetch(url: str, timeout: float = 20) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def clean_text(raw: str | None, limit: int = 300) -> str:
    if not raw:
        return ""
    text = re.sub(r"<[^>]+>", " ", raw)
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > limit:
        text = text[:limit].rsplit(" ", 1)[0] + "…"
    return text


def parse_date(raw: str | None) -> datetime | None:
    if not raw:
        return None
    raw = raw.strip()
    try:
        dt = parsedate_to_datetime(raw)  # RSS: "Tue, 29 Sep 2026 14:00:00 GMT"
    except (TypeError, ValueError):
        try:
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))  # Atom: ISO 8601
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _text(el: ET.Element | None, path: str) -> str | None:
    if el is None:
        return None
    found = el.find(path)
    return found.text if found is not None else None


def parse_feed(xml_bytes: bytes, source: str) -> list[Story]:
    """Parse an RSS 2.0 or Atom document into Stories."""
    root = ET.fromstring(xml_bytes)
    stories: list[Story] = []

    for item in root.iter("item"):  # RSS 2.0
        title = clean_text(_text(item, "title"), limit=500)
        link = (_text(item, "link") or "").strip()
        if not title or not link:
            continue
        # Google News appends " - Publisher" and names the publisher in <source>.
        item_source = _text(item, "source")
        if item_source and title.endswith(f" - {item_source}"):
            title = title[: -len(item_source) - 3]
        dt = parse_date(_text(item, "pubDate"))
        stories.append(Story(
            title=title,
            link=link,
            source=f"{source} ({item_source})" if item_source else source,
            published=dt.isoformat() if dt else None,
            summary=clean_text(_text(item, "description")),
        ))

    for entry in root.iter(f"{ATOM}entry"):  # Atom
        title = clean_text(_text(entry, f"{ATOM}title"), limit=500)
        link_el = entry.find(f"{ATOM}link[@rel='alternate']")
        if link_el is None:
            link_el = entry.find(f"{ATOM}link")
        link = link_el.get("href", "").strip() if link_el is not None else ""
        if not title or not link:
            continue
        dt = parse_date(_text(entry, f"{ATOM}published") or _text(entry, f"{ATOM}updated"))
        stories.append(Story(
            title=title,
            link=link,
            source=source,
            published=dt.isoformat() if dt else None,
            summary=clean_text(_text(entry, f"{ATOM}summary") or _text(entry, f"{ATOM}content")),
        ))

    return stories


def google_news_url(query: str, days: int) -> str:
    q = urllib.parse.quote_plus(f'"{query}" when:{days}d')
    return f"https://news.google.com/rss/search?q={q}&hl=en-US&gl=US&ceid=US:en"


# --------------------------------------------------------------------------
# Classification
# --------------------------------------------------------------------------

def compile_categories(config: dict) -> dict[str, list[re.Pattern]]:
    return {
        name: [re.compile(p, re.IGNORECASE) for p in patterns]
        for name, patterns in config.get("categories", {}).items()
    }


def artist_pattern(name: str) -> re.Pattern:
    # Word boundaries that also work for names starting/ending in punctuation.
    return re.compile(rf"(?<!\w){re.escape(name)}(?!\w)", re.IGNORECASE)


def classify(story: Story, categories: dict[str, list[re.Pattern]],
             artists: dict[str, re.Pattern], forced: str | None = None) -> None:
    # Categories are decided from the headline; summaries are too noisy
    # (e.g. "...who died in 2019" inside an unrelated reissue story).
    headline = story.title
    body = f"{story.title} {story.summary}"
    cats = [name for name, pats in categories.items() if any(p.search(headline) for p in pats)]
    if forced and forced not in cats:
        cats.insert(0, forced)
    story.categories = cats or ["other"]
    story.artists = [name for name, pat in artists.items() if pat.search(body)]


# --------------------------------------------------------------------------
# Pipeline
# --------------------------------------------------------------------------

def _norm_title(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", title.lower()).strip()


def dedupe(stories: Iterable[Story]) -> list[Story]:
    seen_links: set[str] = set()
    by_title: dict[str, Story] = {}
    out: list[Story] = []
    for s in stories:
        link_key = s.link.split("?")[0].rstrip("/")
        title_key = _norm_title(s.title)
        if link_key in seen_links:
            continue
        if title_key in by_title:
            # Same headline from two feeds: keep one, merge what we learned.
            kept = by_title[title_key]
            kept.categories = sorted(set(kept.categories + s.categories) - {"other"}) or ["other"]
            kept.artists = sorted(set(kept.artists + s.artists))
            continue
        seen_links.add(link_key)
        by_title[title_key] = s
        out.append(s)
    return out


def build_feed_list(config: dict, days: int, watchlist: list[str]) -> list[dict]:
    feeds = list(config.get("feeds", []))
    if config.get("search_watchlist_on_google_news", True):
        for artist in watchlist:
            feeds.append({
                "name": f"Google News: {artist}",
                "url": google_news_url(artist, days),
                "artist": artist,
            })
    return feeds


def scrape(config: dict, days: int, watchlist: list[str],
           fetcher: Callable[[str], bytes] = fetch,
           now: datetime | None = None, log=print) -> tuple[list[Story], list[dict]]:
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)
    categories = compile_categories(config)
    artists = {name: artist_pattern(name) for name in watchlist}
    feeds = build_feed_list(config, days, watchlist)

    def load(feed: dict) -> tuple[dict, list[Story] | None, str | None]:
        try:
            return feed, parse_feed(fetcher(feed["url"]), feed["name"]), None
        except Exception as exc:  # one bad feed shouldn't sink the run
            return feed, None, f"{type(exc).__name__}: {exc}"

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(load, feeds))

    stories: list[Story] = []
    errors: list[dict] = []
    for feed, items, err in results:
        if err:
            errors.append({"feed": feed["name"], "url": feed["url"], "error": err})
            log(f"  ! {feed['name']}: {err}", file=sys.stderr)
            continue
        kept = 0
        for s in items:
            if s.published and datetime.fromisoformat(s.published) < cutoff:
                continue
            classify(s, categories, artists, forced=feed.get("category"))
            # Google News artist searches can surface loose matches; keep only
            # stories that actually mention the artist.
            if feed.get("artist") and feed["artist"] not in s.artists:
                continue
            stories.append(s)
            kept += 1
        log(f"  {feed['name']}: {kept} stories", file=sys.stderr)

    stories = dedupe(stories)
    stories.sort(key=lambda s: s.published or "", reverse=True)
    return stories, errors


# --------------------------------------------------------------------------
# Output
# --------------------------------------------------------------------------

def to_markdown(stories: list[Story], generated: datetime, days: int) -> str:
    lines = [
        "# Music News Digest",
        "",
        f"_Generated {generated:%Y-%m-%d %H:%M} UTC · last {days} day(s) · {len(stories)} stories_",
        "",
    ]

    watch = [s for s in stories if s.artists]
    if watch:
        lines += [f"## {CATEGORY_LABELS['watchlist']}", ""]
        by_artist: dict[str, list[Story]] = {}
        for s in watch:
            for a in s.artists:
                by_artist.setdefault(a, []).append(s)
        for artist in sorted(by_artist):
            lines += [f"### {artist}", ""]
            lines += [_md_item(s) for s in by_artist[artist]]
            lines.append("")

    for cat, label in CATEGORY_LABELS.items():
        if cat == "watchlist":
            continue
        items = [s for s in stories if cat in s.categories]
        if not items:
            continue
        lines += [f"## {label} ({len(items)})", ""]
        lines += [_md_item(s) for s in items]
        lines.append("")
    return "\n".join(lines)


def _md_item(s: Story) -> str:
    date = s.published[:10] if s.published else "undated"
    title = s.title.replace("[", "\\[").replace("]", "\\]")
    return f"- [{title}]({s.link}) — {s.source}, {date}"


def write_outputs(stories: list[Story], errors: list[dict], out_dir: Path,
                  days: int, watchlist: list[str], generated: datetime) -> tuple[Path, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    counts: dict[str, int] = {}
    for s in stories:
        for c in s.categories:
            counts[c] = counts.get(c, 0) + 1
    payload = {
        "generated_at": generated.isoformat(),
        "days": days,
        "watchlist": watchlist,
        "counts": counts,
        "stories": [asdict(s) for s in stories],
        "feed_errors": errors,
    }
    json_path = out_dir / "music-news.json"
    md_path = out_dir / "music-news.md"
    json_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    md_path.write_text(to_markdown(stories, generated, days), encoding="utf-8")
    return json_path, md_path


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Scrape music news into categorized JSON + Markdown.")
    ap.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT_DIR, help="output directory")
    ap.add_argument("--days", type=int, help="only keep stories from the last N days")
    ap.add_argument("--artist", action="append", default=[],
                    help="add an artist to the watchlist (repeatable)")
    ap.add_argument("--category", choices=[c for c in CATEGORY_LABELS if c != "watchlist"],
                    help="only keep stories in this category")
    ap.add_argument("--watchlist-only", action="store_true",
                    help="only keep stories mentioning a watchlist artist")
    args = ap.parse_args(argv)

    config = json.loads(args.config.read_text(encoding="utf-8"))
    days = args.days or config.get("days", 7)
    watchlist = list(dict.fromkeys(config.get("watchlist", []) + args.artist))

    print(f"Scraping music news from the last {days} day(s)…", file=sys.stderr)
    stories, errors = scrape(config, days, watchlist)
    if args.category:
        stories = [s for s in stories if args.category in s.categories]
    if args.watchlist_only:
        stories = [s for s in stories if s.artists]

    json_path, md_path = write_outputs(stories, errors, args.out, days, watchlist,
                                       datetime.now(timezone.utc))
    print(f"\n{len(stories)} stories → {json_path} and {md_path}", file=sys.stderr)
    if errors:
        print(f"{len(errors)} feed(s) failed; see feed_errors in the JSON.", file=sys.stderr)
    feeds_total = len(build_feed_list(config, days, watchlist))
    return 1 if errors and len(errors) == feeds_total else 0


if __name__ == "__main__":
    sys.exit(main())
