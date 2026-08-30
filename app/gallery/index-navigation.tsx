import Link from "next/link";

export function IndexNavigation() {
  return (
    <nav
      className="fixed top-2 left-4 z-20 flex flex-col items-start gap-1 text-sm"
      aria-label="Index navigation"
    >
      <Link
        className="no-underline hover:underline focus-visible:underline"
        href="/"
      >
        Elliot Mairet
      </Link>
      <Link
        className="no-underline hover:underline focus-visible:underline"
        href="#about"
      >
        About
      </Link>
    </nav>
  );
}
