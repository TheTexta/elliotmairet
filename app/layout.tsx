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
        <footer
          id="about"
          className="grid grid-cols-1 items-start gap-4 px-4 py-8 font-normal sm:grid-cols-2 sm:px-[calc(100vw/6)]"
        >
          <div className="flex flex-col items-start text-left py-8 sm:py-4">
            <a
              className="no-underline hover:underline focus-visible:underline"
              href="mailto:elliot.mairet@gmail.com"
            >
              elliot.mairet@gmail.com
            </a>
            <a
              className="no-underline hover:underline focus-visible:underline"
              href="https://www.instagram.com/elliotmairet/"
            >
              Instagram
            </a>
          </div>
          <div className="flex flex-col items-start text-left py-8 sm:py-4 sm:items-end sm:text-right">
            <p>
              Elliot Mairet is a Montreal based photographer from Victoria BC.
            </p>
            <p>Above all else he is grateful for you</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
