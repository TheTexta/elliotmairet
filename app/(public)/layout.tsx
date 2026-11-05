import type { Metadata } from "next";
import type { CSSProperties } from "react";

import { masonryGap } from "@/lib/photographs/masonry-geometry";
import { photographImageOrigin } from "@/lib/photographs/storage";
import { getFooterText } from "@/lib/site-content/queries";
import { ImagePreconnect } from "./image-preconnect";
import { PreviewNavigationBridge } from "./preview-navigation-bridge";
import styles from "./layout.module.css";

export const metadata: Metadata = {
  robots: {
    "max-image-preview": "large",
  },
};

export default async function PublicLayout({ children }: LayoutProps<"/">) {
  const footerText = await getFooterText();

  return (
    <div
      className={styles.page}
      style={{ "--gallery-gap-ratio": masonryGap } as CSSProperties}
    >
      <ImagePreconnect origin={photographImageOrigin()} />
      <PreviewNavigationBridge />
      {children}
      <footer
        id="about"
        className="grid grid-cols-1 items-start gap-[var(--gallery-gap)] px-[var(--gallery-gap)] py-[var(--gallery-gap)] font-normal sm:grid-cols-2 sm:gap-4 sm:px-[calc(100vw/6)] sm:py-8"
      >
        <div data-nosnippet="" className="flex flex-col items-start text-left sm:py-4">
          <a
            className="animated-index-link no-underline"
            href="mailto:elliot.mairet@gmail.com"
          >
            elliot.mairet@gmail.com
          </a>
          <a
            className="animated-index-link no-underline"
            href="https://www.instagram.com/elliotmairet/"
          >
            Instagram
          </a>
          <a
            className="animated-index-link mt-[var(--gallery-gap)] no-underline sm:mt-[1lh]"
            href="https://dextery.dev"
          >
            Developed by Dexter
          </a>
        </div>
        {footerText ? (
          <div className="flex flex-col items-start text-left sm:items-end sm:py-4 sm:text-right">
            <p className="whitespace-pre-wrap">{footerText}</p>
          </div>
        ) : null}
      </footer>
    </div>
  );
}
