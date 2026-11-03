import { streamAudio } from "@/lib/stream";

export function GET(request: Request) { return streamAudio(request); }
export function HEAD(request: Request) { return streamAudio(request); }
