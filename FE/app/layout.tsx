import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { QueryProvider } from "@/components/query-provider";
import { ThemeBootstrap } from "@/components/theme-bootstrap";

export const metadata: Metadata = {
  title: "Bản Tin Nội Bộ",
  description: "Nền tảng bản tin nội bộ theo phong cách hiện đại dành cho doanh nghiệp",
  icons: {
    icon: [
      { url: "/icons/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/icons/favicon-32x32.png"]
  },
  manifest: "/manifest.webmanifest"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => {
              const key = 'app-theme';
              const fallback = 'blue';
              const cookieMatch = document.cookie.split('; ').find((item) => item.startsWith(key + '='));
              const themeKey = localStorage.getItem(key) || (cookieMatch ? decodeURIComponent(cookieMatch.split('=')[1] || '') : '') || fallback;
              document.cookie = key + '=' + themeKey + '; path=/; max-age=31536000; samesite=lax';
            })();`
          }}
        />
      </head>
      <body>
        <QueryProvider>
          <ThemeBootstrap />
          <AppShell>{children}</AppShell>
        </QueryProvider>
      </body>
    </html>
  );
}
