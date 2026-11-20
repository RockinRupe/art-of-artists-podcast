# The Art of Everything Podcast

Website for **The Art of Everything** (formerly *Art of Artists*), a podcast where brothers Corbin and Carter Rupe dig into how artists, creators and big ideas got where they are. Music is where it started.

**Live site:** https://rockinrupe.github.io/art-of-artists-podcast/

The site is published with GitHub Pages from the `main` branch, so changes pushed to `main` go live automatically.

## Episodes

The [Episodes page](https://rockinrupe.github.io/art-of-artists-podcast/episodes.html), the page for each episode, and the latest episodes on the home page are built from the podcast's RSS feed by [`scraper/episodes.py`](scraper/episodes.py). The same weekday GitHub Action that updates the news runs it, so a new episode shows up on the site within a weekday of being published. To add it sooner, open the **Actions** tab, pick **Update music news and episodes**, and click **Run workflow**.

Don't edit `episodes.html`, the files in `episodes/`, or the parts of `index.html` between the `<!-- episodes:... -->` markers by hand: the next update overwrites them. Episode titles and descriptions come from your podcast host, so change them there.

Episode numbers show as record sides: season 1 is Side A, season 2 is Side B, so episode 2.2 is **B2**. They come from the season and episode numbers set in your podcast host, or from the title (`Title | 2.2`, `S1E10 Queen`).

The menu, header and footer of the generated pages are copied from `index.html` (between the `<!-- shell:... -->` markers), so change the menu there first. The other hand-written pages (`news.html`, `about.html`, and so on) have their own copy that needs the same change.

## Music News

The [Music News page](https://rockinrupe.github.io/art-of-artists-podcast/news.html) is updated automatically every weekday by a scraper that collects news about the artists we follow.

- **To change which artists it follows,** edit [`scraper/artists.txt`](scraper/artists.txt).
- **To learn how the scraper works,** see [`scraper/README.md`](scraper/README.md).
