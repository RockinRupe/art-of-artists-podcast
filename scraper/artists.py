"""The artist list behind the site's Artists tab.

Reads scraper/show-artists.txt (artists covered on the show) and
scraper/artists.txt (artists followed on the News page), and works out which
episodes are about each artist and which only mention them. Used by
scraper/episodes.py, which writes the pages.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Protocol


class EpisodeLike(Protocol):
    title: str
    summary: str
    notes_html: str


@dataclass
class Artist:
    name: str
    slug: str
    terms: list[str]
    blurb: str = ""
    on_show_list: bool = False
    followed: bool = False          # in scraper/artists.txt, so it has news
    about: list = field(default_factory=list)       # episodes about them
    mentioned: list = field(default_factory=list)   # episodes that mention them

    @property
    def page(self) -> str:
        return f"artists/{self.slug}.html"

    @property
    def sort_key(self) -> str:
        return re.sub(r"^the\s+", "", self.name, flags=re.I).casefold()


def parse_list(text: str) -> list[tuple[str, list[str], str]]:
    """(name, search terms, blurb) for each artist in a list file."""
    out: list[tuple[str, list[str], str]] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith(">"):
            if out:
                name, terms, blurb = out[-1]
                out[-1] = (name, terms, f"{blurb} {line[1:].strip()}".strip())
            continue
        name, *terms = [part.strip() for part in line.split("|")]
        terms = [t for t in terms if t]
        if name:
            out.append((name, terms or [name], ""))
    return out


def load_artists(show_list: Path, watchlist: Path, slugify: Callable[[str], str]) -> list[Artist]:
    artists: dict[str, Artist] = {}
    if show_list.exists():
        for name, terms, blurb in parse_list(show_list.read_text(encoding="utf-8")):
            artists[name.casefold()] = Artist(name, slugify(name), terms, blurb, on_show_list=True)
    if watchlist.exists():
        for name, terms, _ in parse_list(watchlist.read_text(encoding="utf-8")):
            key = name.casefold()
            if key in artists:
                artists[key].followed = True
            else:
                artists[key] = Artist(name, slugify(name), terms, followed=True)
    used: set[str] = set()
    for artist in artists.values():
        base, n = artist.slug, 2
        while artist.slug in used:
            artist.slug = f"{base}-{n}"
            n += 1
        used.add(artist.slug)
    return sorted(artists.values(), key=lambda a: a.sort_key)


def _pattern(terms: list[str]) -> re.Pattern:
    alts = "|".join(re.escape(t) for t in sorted(terms, key=len, reverse=True))
    return re.compile(rf"(?<!\w)(?:{alts})(?!\w)", re.I)


def _notes_text(ep: EpisodeLike) -> str:
    text = re.sub(r"<[^>]+>", " ", ep.notes_html)
    text = re.sub(r"\S*https?://\S+|\S+\.(?:com|fm|net|org)\S*", " ", text)  # links aren't mentions
    return f"{ep.summary} {text}"


def match_episodes(artists: list[Artist], episodes: list) -> None:
    """Fill each artist's `about` and `mentioned` lists (newest first)."""
    for artist in artists:
        pattern = _pattern(artist.terms)
        artist.about, artist.mentioned = [], []
        for ep in episodes:
            if ep.title.casefold() == artist.name.casefold() or pattern.search(ep.title):
                artist.about.append(ep)
            elif pattern.search(_notes_text(ep)):
                artist.mentioned.append(ep)
