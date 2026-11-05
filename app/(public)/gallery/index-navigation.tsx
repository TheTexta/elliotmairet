import Link from "next/link";

import { TransitionLink } from "./transition-link";

const indexLinkClassName =
  "animated-index-link no-underline [text-box:trim-both_cap_alphabetic]";

export function IndexNavigation({ fromPhoto = false }: { fromPhoto?: boolean }) {
  return (
    <nav
      className="fixed top-[var(--gallery-gap)] left-[var(--gallery-gap)] z-20 flex items-start justify-between gap-1 text-sm sm:right-auto sm:flex-col sm:justify-start"
      aria-label="Index navigation"
    >
      {fromPhoto ? (
        <TransitionLink
          className={indexLinkClassName}
          href="/"
          resetScroll
          transitionType="photo-to-gallery"
        >
          Elliot Mairet
        </TransitionLink>
      ) : (
        <Link className={indexLinkClassName} href="/" prefetch={false}>
          Elliot Mairet
        </Link>
      )}
    </nav>
  );
}
