import Link from "next/link";

export function IndexNavigation() {
  return (
    <nav
      className="fixed top-2 right-4 left-4 z-20 flex items-start justify-between gap-1 text-sm sm:right-auto sm:flex-col sm:justify-start"
      aria-label="Index navigation"
    >
      <Link
        className="no-underline hover:underline focus-visible:underline"
        href="/"
      >
        Elliot Mairet
      </Link>
      <a
        className="no-underline hover:underline focus-visible:underline"
        href="#about"
      >
        About
      </a>
    </nav>
  );
}
