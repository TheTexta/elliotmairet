import Link from "next/link";

import { TransitionLink } from "./transition-link";

const indexLinkClassName =
  "no-underline hover:underline focus-visible:underline";

export function IndexNavigation({ fromPhoto = false }: { fromPhoto?: boolean }) {
  return (
    <nav
      className="fixed top-2 right-4 left-4 z-20 flex items-start justify-between gap-1 text-sm sm:right-auto sm:flex-col sm:justify-start"
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
        <Link className={indexLinkClassName} href="/">
          Elliot Mairet
        </Link>
      )}
    </nav>
  );
}
