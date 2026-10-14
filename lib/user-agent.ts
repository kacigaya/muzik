import pkg from "../package.json" with { type: "json" };

// MusicBrainz and LRCLIB expect the app name, version, and operator contact.
// Read the version from package.json to keep it current.
export const USER_AGENT = `Muzik/${pkg.version} ( https://github.com/kacigaya/muzik )`;
