# The Art of Everything Podcast

Website for **The Art of Everything** (formerly *Art of Artists*), a podcast where brothers Corbin and Carter Rupe dig into how artists, creators and big ideas got where they are. Music is where it started.

**Live site:** https://rockinrupe.github.io/art-of-artists-podcast/

The site is published with GitHub Pages from the `main` branch, so changes pushed to `main` go live automatically.

## Episodes

The [Episodes page](https://rockinrupe.github.io/art-of-artists-podcast/episodes.html), the page for each episode, and the latest episodes on the home page are built from the podcast's RSS feed by [`scraper/episodes.py`](scraper/episodes.py). The same weekday GitHub Action that updates the news runs it, so a new episode shows up on the site within a weekday of being published. To add it sooner, open the **Actions** tab, pick **Update music news and episodes**, and click **Run workflow**.

Don't edit `episodes.html`, the files in `episodes/`, or the parts of `index.html` between the `<!-- episodes:... -->` markers by hand: the next update overwrites them. Episode titles and descriptions come from your podcast host, so change them there.

Episode numbers show as record sides: season 1 is Side A, season 2 is Side B, so episode 2.2 is **B2**. They come from the season and episode numbers set in your podcast host, or from the title (`Title | 2.2`, `S1E10 Queen`).

The menu, header and footer of the generated pages are copied from `index.html` (between the `<!-- shell:... -->` markers), so change the menu there first. The other hand-written pages (`news.html`, `about.html`, and so on) have their own copy that needs the same change.

## Artists

The [Artists page](https://rockinrupe.github.io/art-of-artists-podcast/artists.html) and a page for each artist are built by the same weekday update.

- **To add or remove an artist,** edit [`scraper/show-artists.txt`](scraper/show-artists.txt). Instructions are at the top of the file.
- **To add a few words about an artist,** put them on the line under the artist's name, starting with `>`.
- Episodes link up automatically: an episode is "about" an artist when the artist's name is in its title, and "mentions" them when the name is in the show notes.
- Everyone in the News watchlist (`scraper/artists.txt`) also gets a page, with their latest headlines.

## Music News

The [Music News page](https://rockinrupe.github.io/art-of-artists-podcast/news.html) is updated automatically every weekday by a scraper that collects news about the artists we follow.

- **To change which artists it follows,** edit [`scraper/artists.txt`](scraper/artists.txt).
- **To learn how the scraper works,** see [`scraper/README.md`](scraper/README.md).
