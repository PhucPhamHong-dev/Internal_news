import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { QueryProvider } from "@/components/query-provider";

const COMPANY_ICON_URL =
  "https://static.wixstatic.com/media/20df35_3985cf6e76d347f08b9bdc1e4bf2d815~mv2.png/v1/crop/x_0,y_16,w_150,h_119/fill/w_184,h_144,al_c,lg_1,q_85,enc_avif,quality_auto/91505850_104574237870559_618557836888952.png";

export const metadata: Metadata = {
  title: "Bản Tin Nội Bộ",
  description: "Nền tảng bản tin nội bộ",
  icons: {
    icon: COMPANY_ICON_URL,
    shortcut: COMPANY_ICON_URL,
    apple: COMPANY_ICON_URL
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <QueryProvider>
          <AppShell>{children}</AppShell>
        </QueryProvider>
      </body>
    </html>
  );
}
