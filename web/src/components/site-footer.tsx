import Link from "next/link";

const DOCS_URL = "/docs";
const GITHUB_URL = "https://github.com/kacigaya/muzik";
const RELEASES_URL = "https://github.com/kacigaya/muzik/releases";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
        <span>© {new Date().getFullYear()} Muzik</span>
        <nav
          aria-label="Footer"
          className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3"
        >
          <Link href={DOCS_URL} className="hover:text-foreground">
            Documentation
          </Link>
          <a href={GITHUB_URL} className="hover:text-foreground">
            GitHub
          </a>
          <a href={RELEASES_URL} className="hover:text-foreground">
            Releases
          </a>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/cookies" className="hover:text-foreground">
            Cookies
          </Link>
        </nav>
      </div>
    </footer>
  );
}
