import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { ServiceWorker } from "@/components/service-worker";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Muzik",
  description: "Search YouTube Music and save songs, albums, and playlists to your own music library.",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Muzik", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#161616" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${geistMono.variable}`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <ToastProvider>{children}</ToastProvider>
          <ServiceWorker />
        </ThemeProvider>
      </body>
    </html>
  );
}
