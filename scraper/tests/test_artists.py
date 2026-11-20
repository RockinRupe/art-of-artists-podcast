import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import artists as ar  # noqa: E402
import episodes as ep_mod  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"
REPO = Path(__file__).resolve().parents[2]

SHOW_LIST = """# comment
Queen | Freddie Mercury | Brian May
> Our favorite band to argue about.
Post Malone
Kid Cudi
Michael Jackson
"""
WATCHLIST = """Post Malone
Bilmuri
"""


def write_lists(root: Path) -> None:
    (root / "scraper").mkdir(exist_ok=True)
    (root / "scraper" / "show-artists.txt").write_text(SHOW_LIST)
    (root / "scraper" / "artists.txt").write_text(WATCHLIST)


class ListTests(unittest.TestCase):
    def test_parse_terms_and_blurbs(self):
        items = ar.parse_list(SHOW_LIST)
        self.assertEqual(items[0], ("Queen", ["Freddie Mercury", "Brian May"], "Our favorite band to argue about."))
        self.assertEqual(items[1], ("Post Malone", ["Post Malone"], ""))

    def test_watchlist_artists_are_merged_and_marked_followed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_lists(root)
            artists = ar.load_artists(root / "scraper/show-artists.txt", root / "scraper/artists.txt", ep_mod.slugify)
        by_name = {a.name: a for a in artists}
        self.assertEqual(sorted(by_name), ["Bilmuri", "Kid Cudi", "Michael Jackson", "Post Malone", "Queen"])
        self.assertTrue(by_name["Post Malone"].followed and by_name["Post Malone"].on_show_list)
        self.assertTrue(by_name["Bilmuri"].followed and not by_name["Bilmuri"].on_show_list)
        self.assertFalse(by_name["Queen"].followed)

    def test_missing_files_mean_no_artists(self):
        self.assertEqual(ar.load_artists(Path("/nope/a.txt"), Path("/nope/b.txt"), ep_mod.slugify), [])


class MatchTests(unittest.TestCase):
    def setUp(self):
        self.eps = ep_mod.parse_feed((FIXTURES / "podcast.xml").read_bytes())
        self.artists = {a.name: a for a in [
            ar.Artist("Queen", "queen", ["Freddie Mercury", "Brian May"]),
            ar.Artist("Post Malone", "post-malone", ["Post Malone"]),
            ar.Artist("Kid Cudi", "kid-cudi", ["Kid Cudi"]),
            ar.Artist("Example", "example", ["example"]),
        ]}
        ar.match_episodes(list(self.artists.values()), self.eps)

    def test_title_is_about_notes_are_mentions(self):
        self.assertEqual([e.code for e in self.artists["Post Malone"].about], ["A·FIN"])
        self.assertEqual([e.code for e in self.artists["Post Malone"].mentioned], ["B2"])
        self.assertEqual([e.code for e in self.artists["Kid Cudi"].mentioned], ["B2"])

    def test_title_equal_to_name_counts_even_with_other_search_words(self):
        self.assertEqual([e.code for e in self.artists["Queen"].about], ["A10"])

    def test_words_inside_links_are_not_mentions(self):
        # B3's notes link to https://example.com/x
        self.assertEqual(self.artists["Example"].mentioned, [])


class BuildArtistPagesTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        shutil.copy(REPO / "index.html", self.tmp / "index.html")
        write_lists(self.tmp)
        self.eps = ep_mod.parse_feed((FIXTURES / "podcast.xml").read_bytes())

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def test_pages_and_links(self):
        ep_mod.build(self.eps, self.tmp)
        index = (self.tmp / "artists.html").read_text()
        self.assertIn('href="artists/queen.html"', index)
        self.assertIn('href="artists.html" aria-current="page"', index)

        queen = (self.tmp / "artists/queen.html").read_text()
        self.assertIn("Our favorite band to argue about.", queen)
        self.assertIn('href="../episodes/queen.html"', queen)
        self.assertNotIn("data-artist-news", queen)  # not followed, so no news section

        post = (self.tmp / "artists/post-malone.html").read_text()
        self.assertIn('data-artist-news="Post Malone"', post)
        self.assertIn("news.html?artist=Post%20Malone", post)
        self.assertIn("Also mentioned in", post)

        bilmuri = (self.tmp / "artists/bilmuri.html").read_text()
        self.assertIn("haven&rsquo;t done an episode", bilmuri)

    def test_episode_pages_link_their_artists(self):
        ep_mod.build(self.eps, self.tmp)
        page = (self.tmp / "episodes/how-do-artists-get-discovered.html").read_text()
        self.assertIn('<a class="chip" href="../artists/post-malone.html">Post Malone</a>', page)
        self.assertIn('<a class="chip" href="../artists/kid-cudi.html">Kid Cudi</a>', page)

    def test_home_page_lists_covered_artists_newest_first(self):
        ep_mod.build(self.eps, self.tmp)
        home = (self.tmp / "index.html").read_text()
        chips = home.split("<!-- episodes:artists:start -->")[1].split("<!-- episodes:artists:end -->")[0]
        self.assertLess(chips.index("Post Malone"), chips.index("Queen"))
        self.assertNotIn("Bilmuri", chips)  # no episode about them

    def test_artist_taken_off_the_list_loses_its_page(self):
        ep_mod.build(self.eps, self.tmp)
        self.assertTrue((self.tmp / "artists/kid-cudi.html").exists())
        (self.tmp / "scraper/show-artists.txt").write_text(SHOW_LIST.replace("Kid Cudi\n", ""))
        ep_mod.build(self.eps, self.tmp)
        self.assertFalse((self.tmp / "artists/kid-cudi.html").exists())


if __name__ == "__main__":
    unittest.main()
