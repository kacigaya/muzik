export type DownloadProgress = {
  progress: number;
  itemIndex: number | null;
  itemCount: number | null;
};

export function parseProgress(line: string): DownloadProgress | null {
  if (!line.startsWith("muzik:")) return null;
  const [percentText, indexText, countText] = line.slice(6).trim().split("|");
  const percent = Number.parseFloat(percentText.replace("%", ""));
  const itemIndex = Number.parseInt(indexText, 10);
  const itemCount = Number.parseInt(countText, 10);
  if (!Number.isFinite(percent)) return null;
  const boundedPercent = Math.max(0, Math.min(100, percent));
  const hasCollection = Number.isFinite(itemIndex) && Number.isFinite(itemCount) && itemCount > 0;
  const overall = hasCollection
    ? ((Math.max(1, itemIndex) - 1 + boundedPercent / 100) / itemCount) * 100
    : boundedPercent;
  return {
    progress: Math.round(Math.max(0, Math.min(100, overall))),
    itemIndex: hasCollection ? itemIndex : null,
    itemCount: hasCollection ? itemCount : null,
  };
}
