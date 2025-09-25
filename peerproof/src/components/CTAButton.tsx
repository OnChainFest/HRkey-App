import Link from "next/link";
export default function CTAButton({ href, children }:{href:string; children:React.ReactNode}) {
  return (
    <Link
      href={href}
      className="inline-block rounded-md bg-[#FF6B35] px-6 py-3 text-white font-semibold hover:opacity-90"
    >
      {children}
    </Link>
  );
}
