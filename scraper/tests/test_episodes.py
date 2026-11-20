import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import episodes as ep_mod  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"
REPO = Path(__file__).resolve().parents[2]


def load():
    return ep_mod.parse_feed((FIXTURES / "podcast.xml").read_bytes())


class ParseFeedTests(unittest.TestCase):
    def setUp(self):
        self.eps = load()

    def test_codes_follow_sides_and_tracks(self):
        self.assertEqual([e.code for e in self.eps],
                         ["B3", "B2", "B1", "A·FIN", "A10", "Bonus", "Bonus", "A9", "Intro"])

    def test_specials_never_take_another_episodes_number(self):
        xmas, bonus = self.eps[5], self.eps[6]
        self.assertEqual((xmas.title, xmas.season, xmas.number, xmas.bonus), ("Preparing for Christmas", 1, None, True))
        self.assertEqual((bonus.season, bonus.bonus), (1, True))
        self.assertEqual(bonus.where, "Side A, bonus track")

    def test_intro_is_a_trailer_outside_the_seasons(self):
        intro = self.eps[-1]
        self.assertEqual((intro.trailer, intro.season, intro.number), (True, None, None))

    def test_numbers_are_taken_out_of_titles(self):
        self.assertEqual(
            [e.title for e in self.eps[:5]],
            ["Can Artists Change Genres?", "How Do Artists Get Discovered?", "How Bad is AI Music?",
             "Season 1 Finale: Post Malone", "Queen"],
        )

    def test_unnumbered_episode_after_numbered_one_is_next_track(self):
        self.assertEqual((self.eps[0].season, self.eps[0].number), (2, 3))
        self.assertEqual(self.eps[0].where, "Side B, track 3")

    def test_durations(self):
        self.assertEqual([e.duration_label for e in self.eps[:4]], ["42 min", "41 min", "1 hr 2 min", ""])

    def test_slugs_are_unique_and_url_safe(self):
        slugs = [e.slug for e in self.eps]
        self.assertEqual(len(slugs), len(set(slugs)))
        self.assertEqual(self.eps[1].slug, "how-do-artists-get-discovered")
        self.assertEqual(self.eps[7].slug, "quotes-tags")

    def test_known_slug_is_kept_when_title_changes(self):
        eps = ep_mod.parse_feed((FIXTURES / "podcast.xml").read_bytes(), {"ep-b2": "old-slug"})
        self.assertEqual(eps[1].slug, "old-slug")

    def test_episode_image_falls_back_to_show_image(self):
        self.assertEqual(self.eps[4].image, "https://example.com/queen.jpg")
        self.assertEqual(self.eps[0].image, "https://example.com/show.jpg")

    def test_summary_drops_anchor_footer_and_tags(self):
        s = self.eps[0].summary
        self.assertTrue(s.startswith("Can musicians really switch styles?"))
        self.assertNotIn("voice message", s)
        self.assertNotIn("<", s)

    def test_show_notes_are_sanitized(self):
        notes = self.eps[0].notes_html
        self.assertIn('<a href="https://example.com/x" target="_blank" rel="noopener">this</a>', notes)
        self.assertNotIn("javascript:", notes)
        self.assertNotIn("<script", notes)
        self.assertNotIn("alert(1)", notes)
        self.assertNotIn("<img", notes)
        self.assertNotIn("onerror", notes)


class BuildTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        shutil.copy(REPO / "index.html", self.tmp / "index.html")
        self.eps = load()

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def test_build_writes_every_page(self):
        changed = ep_mod.build(self.eps, self.tmp)
        for rel in ["data/episodes.json", "index.html", "episodes.html", "sitemap.xml",
                    "episodes/how-do-artists-get-discovered.html"]:
            self.assertTrue((self.tmp / rel).exists(), rel)
            self.assertIn(rel, changed)
        data = json.loads((self.tmp / "data/episodes.json").read_text())
        self.assertEqual(len(data["episodes"]), 9)

    def test_second_build_with_same_feed_changes_nothing(self):
        ep_mod.build(self.eps, self.tmp)
        self.assertEqual(ep_mod.build(load(), self.tmp), [])

    def test_home_page_gets_latest_episode_and_tracklist(self):
        ep_mod.build(self.eps, self.tmp)
        home = (self.tmp / "index.html").read_text()
        self.assertIn('<a href="episodes/can-artists-change-genres.html">Can Artists Change Genres?</a>', home)
        self.assertIn('data-src="https://example.com/b3.mp3"', home)
        self.assertEqual(home.count('<li class="track'), ep_mod.HOME_EPISODE_COUNT)
        self.assertIn("<!-- episodes:list:end -->", home)

    def test_titles_are_escaped(self):
        ep_mod.build(self.eps, self.tmp)
        page = (self.tmp / "episodes/quotes-tags.html").read_text()
        self.assertIn("&quot;Quotes&quot; &amp; &lt;Tags&gt;", page)
        self.assertNotIn("<Tags>", page)

    def test_episode_without_audio_links_to_spotify(self):
        ep_mod.build(self.eps, self.tmp)
        page = (self.tmp / "episodes/quotes-tags.html").read_text()
        self.assertNotIn("data-play", page)
        self.assertIn("open.spotify.com/show", page)

    def test_episode_pages_use_paths_from_their_folder(self):
        ep_mod.build(self.eps, self.tmp)
        page = (self.tmp / "episodes/queen.html").read_text()
        self.assertIn('href="../styles.css"', page)
        self.assertIn('href="../news.html"', page)
        self.assertIn('href="../episodes.html" aria-current="page"', page)
        self.assertIn('data-href="../episodes/queen.html"', page)
        self.assertNotIn('href="../https:', page)

    def test_removed_episode_page_is_deleted(self):
        ep_mod.build(self.eps, self.tmp)
        ep_mod.build([e for e in self.eps if e.slug != "quotes-tags"], self.tmp)
        self.assertFalse((self.tmp / "episodes/quotes-tags.html").exists())

    def test_empty_feed_keeps_existing_pages(self):
        with self.assertRaises(ValueError):
            ep_mod.build([], self.tmp)


if __name__ == "__main__":
    unittest.main()
