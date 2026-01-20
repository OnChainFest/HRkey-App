"use client";

/**
 * NavbarClient Component
 *
 * Client-side navbar components for HRKey:
 * - Notification bell with real-time updates
 * - Wallet display (compact)
 * - User authentication state
 * - User menu dropdown
 *
 * This is separated from the main Navbar to keep the Navbar as a server component
 * while allowing client-side interactivity for these features.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { apiGet } from '@/lib/apiClient';
import NotificationBell from './notifications/NotificationBell';
import Link from 'next/link';

interface User {
  id: string;
  email: string;
  name?: string;
}

interface WalletInfo {
  wallet_address: string;
  balance: {
    rlusd_formatted: string;
  };
}

export default function NavbarClient() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);

  /**
   * Check authentication and load user data
   */
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();

        if (sessionData.session?.user) {
          setUser({
            id: sessionData.session.user.id,
            email: sessionData.session.user.email || '',
            name: sessionData.session.user.user_metadata?.name,
          });

          // Load wallet info
          try {
            const walletResponse = await apiGet<{ success: boolean; wallet: WalletInfo }>(
              '/api/wallet/me'
            );
            if (walletResponse.success && walletResponse.wallet) {
              setWallet(walletResponse.wallet);
            }
          } catch (err) {
            // No wallet - that's OK
            console.log('No wallet found');
          }
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error('Auth check failed:', err);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          name: session.user.user_metadata?.name,
        });
      } else {
        setUser(null);
        setWallet(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  /**
   * Handle sign out
   */
  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setWallet(null);
      router.push('/');
    } catch (err) {
      console.error('Sign out failed:', err);
    }
  };

  /**
   * Truncate wallet address
   */
  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center space-x-4">
        <div className="w-8 h-8 bg-slate-200 rounded-full animate-pulse"></div>
        <div className="w-24 h-8 bg-slate-200 rounded animate-pulse"></div>
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return (
      <div className="flex items-center space-x-4">
        <Link
          href="/login"
          className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900"
        >
          Sign In
        </Link>
        <Link
          href="/signup"
          className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          Get Started
        </Link>
      </div>
    );
  }

  // Authenticated
  return (
    <div className="flex items-center space-x-4">
      {/* Wallet Display (Compact) */}
      {wallet && (
        <Link
          href="/wallet"
          className="flex items-center space-x-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <div className="flex items-center space-x-1.5">
            {/* Wallet Icon */}
            <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
              />
            </svg>
            {/* Balance */}
            <span className="text-sm font-semibold text-slate-900">
              {wallet.balance.rlusd_formatted}
            </span>
            <span className="text-xs text-slate-600">RLUSD</span>
          </div>
        </Link>
      )}

      {/* Notification Bell */}
      <NotificationBell userId={user.id} maxDisplay={5} />

      {/* User Menu */}
      <div className="relative">
        <button
          onClick={() => setShowUserMenu(!showUserMenu)}
          className="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {/* User Avatar */}
          <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center">
            <span className="text-sm font-medium text-white">
              {user.name
                ? user.name.charAt(0).toUpperCase()
                : user.email.charAt(0).toUpperCase()}
            </span>
          </div>
          {/* Chevron */}
          <svg
            className={`w-4 h-4 text-slate-600 transition-transform ${
              showUserMenu ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* User Menu Dropdown */}
        {showUserMenu && (
          <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50">
            {/* User Info */}
            <div className="px-4 py-3 border-b border-slate-100">
              <div className="text-sm font-medium text-slate-900">
                {user.name || 'User'}
              </div>
              <div className="text-xs text-slate-600 truncate">{user.email}</div>
              {wallet && (
                <div className="text-xs text-slate-500 mt-1 font-mono">
                  {truncateAddress(wallet.wallet_address)}
                </div>
              )}
            </div>

            {/* Menu Items */}
            <div className="py-1">
              <Link
                href="/dashboard"
                className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => setShowUserMenu(false)}
              >
                Dashboard
              </Link>
              <Link
                href="/wallet"
                className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => setShowUserMenu(false)}
              >
                Wallet
              </Link>
              <Link
                href="/notifications"
                className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => setShowUserMenu(false)}
              >
                Notifications
              </Link>
              <Link
                href="/settings"
                className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => setShowUserMenu(false)}
              >
                Settings
              </Link>
            </div>

            {/* Sign Out */}
            <div className="border-t border-slate-100 py-1">
              <button
                onClick={handleSignOut}
                className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
