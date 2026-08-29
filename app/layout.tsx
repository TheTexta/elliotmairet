import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Elliot Mairet",
  description: "Photographs by Elliot Mairet",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="min-w-[320px] m-0 bg-white text-black font-sans text-sm font-semibold tracking-[-0.055em] leading-[1.35] [-webkit-tap-highlight-color:transparent]">
        {children}
      </body>
    </html>
  );
}
