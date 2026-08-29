import Link from "next/link";

export function IndexNavigation({ contactHref }: { contactHref: string }) {
  return (
    <nav
      className="fixed top-2.5 left-2.5 z-20 flex flex-col items-start gap-1 text-[0.8125rem] font-normal tracking-[-0.035em] text-[#050505]"
      aria-label="Index navigation"
    >
      <Link
        className="no-underline hover:underline focus-visible:underline"
        href="/"
      >
        Elliot Mairet
      </Link>
      
      <div className="flex flex-col gap-1 mt-auto mb-0 bottom-2.5 fixed">
      <span
        className="no-underline"
      >
        Contact:
      </span>

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
    </nav>
  );
}
