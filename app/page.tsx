import { MuzikApp } from "@/components/muzik-app";

// Read at request time so a prebuilt image can be pointed at any library.
export const dynamic = "force-dynamic";

export default function Page() {
  return <MuzikApp navidromeUrl={process.env.NAVIDROME_URL ?? ""} />;
}
