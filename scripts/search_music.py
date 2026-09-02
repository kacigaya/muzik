#!/usr/bin/env python3
"""Small JSON bridge around ytmusicapi."""

import json
import sys
from typing import Any

from ytmusicapi import YTMusic


def thumbnail(item: dict[str, Any]) -> str | None:
    thumbnails = item.get("thumbnails") or []
    return thumbnails[-1].get("url") if thumbnails else None


def artist_text(item: dict[str, Any]) -> str:
    artists = item.get("artists") or []
    if artists:
        return ", ".join(artist.get("name", "") for artist in artists if artist.get("name"))
    return item.get("artist") or item.get("author") or "Unknown artist"


def normalize_song(item: dict[str, Any]) -> dict[str, Any] | None:
    video_id = item.get("videoId")
    if not video_id:
        return None
    album = (item.get("album") or {}).get("name")
    artist = artist_text(item)
    return {
        "kind": "song",
        "sourceId": video_id,
        "title": item.get("title") or "Unknown title",
        "subtitle": f"{artist} · {album}" if album else artist,
        "artist": artist,
        "album": album,
        "thumbnail": thumbnail(item),
        "durationSeconds": item.get("duration_seconds"),
        "trackNumber": item.get("trackNumber"),
        "itemCount": None,
    }


def normalize_album(item: dict[str, Any]) -> dict[str, Any] | None:
    playlist_id = item.get("playlistId")
    if not playlist_id:
        return None
    artist = artist_text(item)
    year = item.get("year")
    return {
        "kind": "album",
        "sourceId": playlist_id,
        "title": item.get("title") or "Unknown album",
        "subtitle": f"{artist} · {year}" if year else artist,
        "artist": artist,
        "album": item.get("title") or "Unknown album",
        "thumbnail": thumbnail(item),
        "durationSeconds": None,
        "trackNumber": None,
        "itemCount": None,
    }


def normalize_playlist(item: dict[str, Any]) -> dict[str, Any] | None:
    playlist_id = (item.get("browseId") or item.get("playlistId") or "").removeprefix("VL")
    if not playlist_id:
        return None
    count = item.get("itemCount")
    try:
        item_count = int(str(count).replace(",", "")) if count else None
    except ValueError:
        item_count = None
    return {
        "kind": "playlist",
        "sourceId": playlist_id,
        "title": item.get("title") or "Unknown playlist",
        "subtitle": artist_text(item),
        "artist": artist_text(item),
        "album": None,
        "thumbnail": thumbnail(item),
        "durationSeconds": None,
        "trackNumber": None,
        "itemCount": item_count,
    }


def normalize_resolved_song(data: dict[str, Any]) -> dict[str, Any] | None:
    details = data.get("videoDetails") or {}
    status = (data.get("playabilityStatus") or {}).get("status")
    if status != "OK" or not details.get("videoId"):
        return None
    length = details.get("lengthSeconds")
    return {
        "kind": "song",
        "sourceId": details["videoId"],
        "title": details.get("title") or "Unknown title",
        "subtitle": details.get("author") or "Unknown artist",
        "artist": details.get("author") or "Unknown artist",
        "album": None,
        "thumbnail": thumbnail(details.get("thumbnail") or {}),
        "durationSeconds": int(length) if str(length).isdigit() else None,
        "trackNumber": None,
        "itemCount": None,
    }


def normalize_resolved_album(playlist_id: str, data: dict[str, Any]) -> dict[str, Any]:
    artist = artist_text(data)
    year = data.get("year")
    return {
        "kind": "album",
        "sourceId": playlist_id,
        "title": data.get("title") or "Unknown album",
        "subtitle": f"{artist} · {year}" if year else artist,
        "artist": artist,
        "album": data.get("title") or "Unknown album",
        "thumbnail": thumbnail(data),
        "durationSeconds": None,
        "trackNumber": None,
        "itemCount": data.get("trackCount"),
    }


def normalize_resolved_playlist(kind: str, playlist_id: str, data: dict[str, Any]) -> dict[str, Any]:
    author = data.get("author")
    if isinstance(author, dict):
        author = author.get("name")
    count = data.get("trackCount")
    return {
        "kind": kind,
        "sourceId": playlist_id,
        "title": data.get("title") or "Unknown playlist",
        "subtitle": author or "Unknown artist",
        "artist": author or "Unknown artist",
        "album": None,
        "thumbnail": thumbnail(data),
        "durationSeconds": None,
        "trackNumber": None,
        "itemCount": int(count) if str(count).isdigit() else None,
    }


def normalize_track(item: dict[str, Any], index: int, fallback_album: str | None) -> dict[str, Any] | None:
    video_id = item.get("videoId")
    if not video_id:
        return None
    album = (item.get("album") or {}).get("name") if isinstance(item.get("album"), dict) else fallback_album
    artist = artist_text(item)
    duration = item.get("duration_seconds")
    return {
        "kind": "song",
        "sourceId": video_id,
        "title": item.get("title") or f"Track {index}",
        "subtitle": f"{artist} \u00b7 {album}" if album else artist,
        "artist": artist,
        "album": album,
        "thumbnail": thumbnail(item),
        "durationSeconds": duration if isinstance(duration, int) else None,
        "trackNumber": item.get("trackNumber") if isinstance(item.get("trackNumber"), int) else None,
        "itemCount": None,
    }


def list_tracks(kind: str, source_id: str, client: YTMusic) -> list[dict[str, Any]]:
    if kind == "album":
        browse_id = client.get_album_browse_id(source_id) or source_id
        data = client.get_album(browse_id)
        album_title = data.get("title")
        tracks = data.get("tracks") or []
    else:
        data = client.get_playlist(source_id, limit=500)
        album_title = None
        tracks = data.get("tracks") or []
    items = []
    for index, track in enumerate(tracks, start=1):
        entry = normalize_track(track, index, album_title)
        if entry:
            items.append(entry)
    return items


def resolve_item(kind: str, source_id: str, client: YTMusic) -> dict[str, Any] | None:
    if kind == "song":
        return normalize_resolved_song(client.get_song(source_id))
    if kind == "album":
        browse_id = client.get_album_browse_id(source_id)
        if browse_id:
            return normalize_resolved_album(source_id, client.get_album(browse_id))
    return normalize_resolved_playlist(kind, source_id, client.get_playlist(source_id, limit=1))


def build_response(query: str, client: YTMusic) -> dict[str, Any]:
    groups = (("songs", normalize_song), ("albums", normalize_album), ("playlists", normalize_playlist))
    response: dict[str, Any] = {"query": query}
    for name, normalize in groups:
        response[name] = [entry for item in client.search(query, filter=name, limit=10) if (entry := normalize(item))]
    return response


def main() -> None:
    if len(sys.argv) == 4 and sys.argv[1] == "tracks":
        print(json.dumps({"items": list_tracks(sys.argv[2], sys.argv[3], YTMusic())}, ensure_ascii=False))
    elif len(sys.argv) == 4 and sys.argv[1] == "resolve":
        item = resolve_item(sys.argv[2], sys.argv[3], YTMusic())
        if not item:
            print(json.dumps({"error": "This item is unavailable."}))
            raise SystemExit(1)
        print(json.dumps(item, ensure_ascii=False))
    elif len(sys.argv) == 2:
        print(json.dumps(build_response(sys.argv[1], YTMusic()), ensure_ascii=False))
    else:
        raise SystemExit("query required")


if __name__ == "__main__":
    main()
