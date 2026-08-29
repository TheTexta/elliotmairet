import Link from "next/link";

export function IndexNavigation({ contactHref }: { contactHref: string }) {
  return (
    <nav
      className="fixed top-[0.625rem] left-[0.625rem] z-20 flex flex-col items-start gap-1 text-[0.8125rem] font-normal tracking-[-0.035em] text-[#050505]"
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
        href={contactHref}
      >
        Contact
      </a>
    </nav>
  );
}