import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { Analytics } from "@vercel/analytics/next"

import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Elliot Mairet",
  description: "Photographs by Elliot Mairet",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="scroll-smooth">
      <body
        className={`${montserrat.className} min-w-[320px] m-0 bg-white text-black text-sm uppercase  [-webkit-tap-highlight-color:transparent]`}
      >
        {children}
      </body>
    </html>
  );
}
