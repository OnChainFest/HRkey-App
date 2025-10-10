import Link from "next/link";
import Logo from "./Logo";
export default function Navbar() {
  return (
    <nav className="mx-auto max-w-6xl flex items-center justify-between px-6 py-5">
      <Logo />
      <Link href="/dashboard" className="text-sm font-medium">Start Now</Link>
      <Link href="/about" className="hover:underline">About</Link>
    </nav>
  );
}
