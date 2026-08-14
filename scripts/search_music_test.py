import unittest

from search_music import (
    normalize_album,
    normalize_playlist,
    normalize_resolved_album,
    normalize_resolved_playlist,
    normalize_resolved_song,
    normalize_song,
)


class SearchNormalizationTest(unittest.TestCase):
    def test_normalizes_supported_results(self):
        song = normalize_song({"videoId": "abcdefghijk", "title": "Song", "artists": [{"name": "Artist"}], "album": {"name": "Album"}, "duration_seconds": 123})
        album = normalize_album({"playlistId": "OLAK5uy_example", "title": "Album", "artist": "Artist", "year": "2026"})
        playlist = normalize_playlist({"browseId": "VLPL_example123", "title": "Mix", "author": "Owner", "itemCount": "1,234"})
        self.assertEqual(song["subtitle"], "Artist · Album")
        self.assertEqual(album["sourceId"], "OLAK5uy_example")
        self.assertEqual(playlist["sourceId"], "PL_example123")
        self.assertEqual(playlist["itemCount"], 1234)


class ResolveNormalizationTest(unittest.TestCase):
    def test_normalizes_resolved_song(self):
        song = normalize_resolved_song({
            "playabilityStatus": {"status": "OK"},
            "videoDetails": {
                "videoId": "abcdefghijk",
                "title": "Song",
                "author": "Artist",
                "lengthSeconds": "123",
                "thumbnail": {"thumbnails": [{"url": "https://i.ytimg.com/small.jpg"}, {"url": "https://i.ytimg.com/big.jpg"}]},
            },
        })
        self.assertEqual(song["kind"], "song")
        self.assertEqual(song["sourceId"], "abcdefghijk")
        self.assertEqual(song["subtitle"], "Artist")
        self.assertEqual(song["durationSeconds"], 123)
        self.assertEqual(song["thumbnail"], "https://i.ytimg.com/big.jpg")

    def test_rejects_unplayable_song(self):
        data = {"playabilityStatus": {"status": "LOGIN_REQUIRED"}, "videoDetails": {"videoId": "abcdefghijk"}}
        self.assertIsNone(normalize_resolved_song(data))
        self.assertIsNone(normalize_resolved_song({}))

    def test_normalizes_resolved_album(self):
        album = normalize_resolved_album("OLAK5uy_example", {"title": "Album", "artists": [{"name": "Artist"}], "year": "2017", "trackCount": 10, "thumbnails": [{"url": "https://i.ytimg.com/a.jpg"}]})
        self.assertEqual(album["kind"], "album")
        self.assertEqual(album["sourceId"], "OLAK5uy_example")
        self.assertEqual(album["subtitle"], "Artist · 2017")
        self.assertEqual(album["itemCount"], 10)

    def test_normalizes_resolved_playlist(self):
        playlist = normalize_resolved_playlist("playlist", "PL_example123", {"title": "Mix", "author": {"name": "Owner"}, "trackCount": 25, "thumbnails": []})
        self.assertEqual(playlist["kind"], "playlist")
        self.assertEqual(playlist["sourceId"], "PL_example123")
        self.assertEqual(playlist["subtitle"], "Owner")
        self.assertEqual(playlist["itemCount"], 25)
        self.assertIsNone(playlist["thumbnail"])


if __name__ == "__main__":
    unittest.main()
