import pkg from "../package.json" with { type: "json" };

/**
 * MusicBrainz blocks agents that do not identify the application, its version, and a way
 * to reach whoever runs it. lrclib.net asks for the same courtesy. The version is read
 * from package.json so a release cannot leave a stale number behind here.
 */
export const USER_AGENT = `Muzik/${pkg.version} ( https://github.com/kacigaya/muzik )`;
