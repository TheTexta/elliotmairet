import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { defaultSeoDescription, defaultSeoTitle } from "@/lib/site-content/queries";
import { siteMetadataBase, siteName } from "@/lib/seo";

import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  applicationName: siteName,
  authors: [{ name: siteName }],
  creator: siteName,
  description: defaultSeoDescription,
  metadataBase: siteMetadataBase,
  openGraph: {
    description: defaultSeoDescription,
    locale: "en_CA",
    siteName,
    title: defaultSeoTitle,
    type: "website",
    url: "/",
  },
  publisher: siteName,
  title: {
    default: defaultSeoTitle,
    template: `%s | ${siteName}`,
  },
  twitter: {
    card: "summary_large_image",
    description: defaultSeoDescription,
    title: defaultSeoTitle,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="scroll-smooth">
      <body
        className={`${montserrat.className} min-w-[320px] m-0 bg-white text-black text-sm uppercase  [-webkit-tap-highlight-color:transparent]`}
      >
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
