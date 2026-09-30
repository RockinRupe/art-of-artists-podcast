import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import music_news as mn  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"
NOW = datetime(2026, 9, 30, 12, 0, tzinfo=timezone.utc)


def quiet(*args, **kwargs):
    pass


def fake_fetcher(url):
    if "news.google.com" in url:
        return (FIXTURES / "google_news.xml").read_bytes()
    if "atom" in url:
        return (FIXTURES / "atom.xml").read_bytes()
    if "broken" in url:
        raise OSError("connection refused")
    return (FIXTURES / "rss.xml").read_bytes()


def load_config(**overrides):
    config = json.loads((Path(mn.DEFAULT_CONFIG)).read_text())
    config.update(overrides)
    return config


class ParseTests(unittest.TestCase):
    def test_rss(self):
        stories = mn.parse_feed((FIXTURES / "rss.xml").read_bytes(), "Test")
        self.assertEqual(len(stories), 5)
        self.assertEqual(stories[0].summary, "The singer passed away at home.")
        self.assertEqual(stories[0].published, "2026-09-29T14:00:00+00:00")

    def test_atom(self):
        stories = mn.parse_feed((FIXTURES / "atom.xml").read_bytes(), "Atom")
        self.assertEqual([s.link for s in stories],
                         ["https://other.example.com/radiohead", "https://other.example.com/beyonce"])
        self.assertEqual(stories[1].published, "2026-09-29T02:00:00+00:00")

    def test_google_news_strips_publisher_suffix(self):
        stories = mn.parse_feed((FIXTURES / "google_news.xml").read_bytes(), "GN")
        self.assertEqual(stories[0].title, "Taylor Swift surprise-releases acoustic EP")
        self.assertEqual(stories[0].source, "Billboard")


class ScrapeTests(unittest.TestCase):
    def setUp(self):
        config = load_config(feeds=[
            {"name": "RSS", "url": "https://example.com/rss"},
            {"name": "Atom", "url": "https://example.com/atom"},
        ])
        self.stories, self.errors = mn.scrape(
            config, 7, ["Radiohead", "Taylor Swift", "Beyoncé", "Kendrick Lamar"],
            fetcher=fake_fetcher, now=NOW, log=quiet)
        self.by_title = {s.title: s for s in self.stories}

    def test_categories(self):
        self.assertIn("death", self.by_title["Legendary Soul Singer Jane Doe Dies at 81"].categories)
        self.assertIn("new_release", self.by_title["Radiohead Announce New Album, Share Lead Single"].categories)
        self.assertIn("tour", self.by_title["Kendrick Lamar Adds Stadium Tour Dates"].categories)
        self.assertIn("awards_charts", self.by_title["Beyoncé Wins Big at Awards Show"].categories)
        self.assertIn("new_release", self.by_title["Taylor Swift surprise-releases acoustic EP"].categories)

    def test_band_name_and_summary_do_not_trigger_death(self):
        story = self.by_title["Grateful Dead Archive Opens to Public"]
        self.assertNotIn("death", story.categories)

    def test_old_stories_dropped(self):
        self.assertNotIn("Old Story From Last Year", self.by_title)

    def test_duplicates_merged_across_feeds(self):
        radiohead = [s for s in self.stories if "radiohead" in s.title.lower()]
        self.assertEqual(len(radiohead), 1)
        self.assertEqual(radiohead[0].artists, ["Radiohead"])

    def test_watchlist_search_requires_artist_mention(self):
        self.assertNotIn("Swifties flood stadium parking lot", self.by_title)
        self.assertEqual(self.by_title["Taylor Swift surprise-releases acoustic EP"].artists, ["Taylor Swift"])

    def test_sorted_newest_first(self):
        dates = [s.published for s in self.stories]
        self.assertEqual(dates, sorted(dates, reverse=True))

    def test_feed_errors_are_collected_not_fatal(self):
        config = load_config(feeds=[
            {"name": "RSS", "url": "https://example.com/rss"},
            {"name": "Broken", "url": "https://broken.example.com/feed"},
        ], search_watchlist_on_google_news=False)
        stories, errors = mn.scrape(config, 7, [], fetcher=fake_fetcher, now=NOW, log=quiet)
        self.assertTrue(stories)
        self.assertEqual([e["feed"] for e in errors], ["Broken"])

    def test_write_outputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            json_path, md_path = mn.write_outputs(self.stories, self.errors, Path(tmp), 7, [], NOW)
            data = json.loads(json_path.read_text())
            self.assertEqual(len(data["stories"]), len(self.stories))
            md = md_path.read_text()
            self.assertIn("## Deaths & Tributes (1)", md)
            self.assertIn("### Radiohead", md)


if __name__ == "__main__":
    unittest.main()
