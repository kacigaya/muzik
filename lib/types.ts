export type SearchKind = "song" | "album" | "playlist";

export type SearchItem = {
  kind: SearchKind;
  sourceId: string;
  title: string;
  subtitle: string;
  thumbnail: string | null;
  durationSeconds: number | null;
  itemCount: number | null;
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
  | "completed"
  | "completed_with_warnings"
  | "failed"
  | "cancelled";

export type DownloadJob = {
  id: string;
  kind: SearchKind;
  sourceId: string;
  title: string;
  subtitle: string;
  thumbnail: string | null;
  status: JobStatus;
  progress: number;
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
  "kind" | "sourceId" | "title" | "subtitle" | "thumbnail"
>;
