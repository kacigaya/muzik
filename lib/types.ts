export type SearchKind = "song" | "album" | "playlist";

export const AUDIO_FORMATS = ["m4a", "opus", "flac", "mp3"] as const;
export type AudioFormat = (typeof AUDIO_FORMATS)[number];

export type SearchItem = {
  kind: SearchKind;
  sourceId: string;
  title: string;
  subtitle: string;
  thumbnail: string | null;
  durationSeconds: number | null;
  itemCount: number | null;
  /** Set for sources outside YouTube Music, where the link itself is the identifier. */
  url?: string | null;
};

export type SearchResponse = {
  query: string;
  songs: SearchItem[];
  albums: SearchItem[];
  playlists: SearchItem[];
};

export type JobStatus =
  | "queued"
  | "running"
  | "retrying"
  | "completed"
  | "completed_with_warnings"
  | "failed"
  | "cancelled";

export type DownloadJob = {
  id: string;
  kind: SearchKind;
  sourceId: string;
  url: string | null;
  title: string;
  subtitle: string;
  thumbnail: string | null;
  format: AudioFormat;
  status: JobStatus;
  progress: number;
  speed: string | null;
  etaSeconds: number | null;
  itemIndex: number | null;
  itemCount: number | null;
  downloadedItems: number;
  warningCount: number;
  error: string | null;
  metadataWarning: string | null;
  scanWarning: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateJobRequest = Pick<
  DownloadJob,
  "kind" | "sourceId" | "url" | "title" | "subtitle" | "thumbnail" | "format"
>;

export type Subscription = {
  id: string;
  kind: Extract<SearchKind, "album" | "playlist">;
  sourceId: string;
  title: string;
  subtitle: string;
  thumbnail: string | null;
  format: AudioFormat;
  intervalHours: number;
  createdAt: string;
  lastCheckedAt: string | null;
  lastJobId: string | null;
};

export type LibraryEntry = {
  name: string;
  path: string;
  kind: "folder" | "track";
  sizeBytes: number | null;
  sourceId: string | null;
};
