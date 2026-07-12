import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

requests_stub = types.ModuleType("requests")
requests_stub.RequestException = OSError
requests_stub.get = unittest.mock.MagicMock()
sys.modules.setdefault("requests", requests_stub)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import build_feeds


class EtymologyHelpersTests(unittest.TestCase):
    def test_extracts_language_forms_and_roots(self):
        text = 'from Old English wind and PIE root *weh-; Proto-Germanic *windaz'
        self.assertEqual(build_feeds._etym_form(text, "Old English"), "wind")
        self.assertEqual(build_feeds._etym_pie(text), "*weh-")
        self.assertEqual(build_feeds._etym_form("an Old English word for thing", "Old English"), "")

    def test_extracts_compound_composition(self):
        self.assertEqual(
            build_feeds._etym_composition('from manu "hand" and + factura "a working"'),
            "manu 'hand' + factura 'a working'",
        )

    def test_builds_deduplicated_shaped_entries(self):
        prose = "Old English wind and PIE root *weh- " + ("history " * 20)
        raw = json.dumps([
            {"word": "Wind", "etymology": prose, "pos": "n", "years": [1200]},
            {"word": "wind", "etymology": prose},
            {"word": "short", "etymology": "too short"},
        ])
        with patch.object(build_feeds, "_cached_fetch", return_value=raw):
            entries = build_feeds.build_etymology_entries()
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["word"], "Wind")
        self.assertEqual(entries[0]["earliest"], "c. 1200")


class AnglishHelpersTests(unittest.TestCase):
    def test_cleans_wikitext(self):
        text = "'''bold''' [[Page|shown]]<br />[https://x.test label] {{Over|word|tip}}"
        self.assertEqual(build_feeds._wikitext_clean(text), "bold shown; label word")

    def test_splits_only_top_level_commas(self):
        self.assertEqual(build_feeds._split_top_level("one (a, b), two, three"), ["one (a, b)", "two", "three"])

    def test_parses_wordbook_rows(self):
        text = "|-\n| earth\n| n\n| ground\n| soil\n|-\n| colspan=4 | divider"
        self.assertEqual(build_feeds._parse_wordbook_rows(text), [("earth", "n", "ground", "soil")])

    def test_merges_moot_and_hurlebatte_without_overwriting(self):
        with patch.object(build_feeds, "_wordbook_page_titles", return_value=["English Wordbook/A"]), \
             patch.object(build_feeds, "_wordbook_page_wikitext", return_value="|-\n| abandon\n| v\n| forsake, forgo\n| shed"), \
             patch.object(build_feeds, "_hurlebatte_pairs", return_value={"abandon": "leave", "hello": "hail"}):
            entries = build_feeds.build_anglish_entries()
        by_word = {entry["modern"]: entry for entry in entries}
        self.assertEqual(by_word["abandon"]["anglish"], "forsake")
        self.assertEqual(by_word["hello"]["anglish"], "hail")


class HackerNewsFeedTests(unittest.TestCase):
    def test_maps_hits_and_skips_invalid_ids(self):
        payload = {"hits": [
            {"objectID": "42", "title": "Story", "points": 4, "num_comments": 2, "created_at_i": 1, "author": "a"},
            {"objectID": "bad", "title": "Skip"},
        ]}
        response = unittest.mock.MagicMock()
        response.__enter__.return_value = response
        with patch("urllib.request.urlopen", return_value=response), patch("json.load", return_value=payload):
            entries = build_feeds.build_hn_entries()
        self.assertEqual(entries[0]["id"], 42)
        self.assertIn("item?id=42", entries[0]["url"])
        self.assertEqual(len(entries), 1)

    def test_envelope_contract(self):
        envelope = build_feeds._envelope([{"id": 1}])
        self.assertEqual(envelope["version"], 1)
        self.assertEqual(envelope["entries"], [{"id": 1}])
        self.assertIn("+00:00", envelope["updatedAt"])


if __name__ == "__main__":
    unittest.main()
