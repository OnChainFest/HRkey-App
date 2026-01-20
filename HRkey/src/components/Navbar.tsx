import Link from "next/link";
import Logo from "./Logo";
import NavbarClient from "./NavbarClient";

export default function Navbar() {
  return (
    <nav className="mx-auto max-w-6xl flex items-center justify-between px-6 py-5">
      <Logo />

      {/* Navigation Links */}
      <div className="flex items-center space-x-6">
        <Link href="/dashboard" className="text-sm font-medium text-slate-700 hover:text-slate-900">
          Dashboard
        </Link>
        <Link href="/wallet" className="text-sm font-medium text-slate-700 hover:text-slate-900">
          Wallet
        </Link>
        <Link href="/about" className="text-sm font-medium text-slate-700 hover:text-slate-900">
          About
        </Link>
      </div>

      {/* Client-side components (notifications, wallet, auth) */}
      <NavbarClient />
    </nav>
  );
}
