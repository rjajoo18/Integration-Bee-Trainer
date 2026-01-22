'use client';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { useState, useRef, useEffect } from 'react';

export default function Navbar() {
  const { data: session, status } = useSession();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <nav className="fixed top-0 w-full z-50 bg-[#0d1117]/80 backdrop-blur-md border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        
        {/* Logo */}
        <Link href="/" className="text-xl font-bold text-white tracking-tighter hover:text-blue-500 transition group">
          IBT
        </Link>

        {/* Navigation Links */}
        <div className="flex items-center gap-6">
          <Link href="/" className="hidden md:block text-sm font-medium text-gray-400 hover:text-white transition">
            Home
          </Link>
          <Link href="/trainer" className="hidden md:block text-sm font-medium text-gray-400 hover:text-white transition">
            Trainer
          </Link>

          <Link href="/battle" className="hidden md:block text-sm font-medium text-gray-400 hover:text-white transition">
            Battle
          </Link>

          {/* Auth State Logic */}
          {status === 'authenticated' ? (
            <div className="relative ml-4" ref={dropdownRef}>
              {/* Avatar Button */}
              <button 
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center gap-3 focus:outline-none"
              >
                <div className="text-right hidden sm:block">
                  <p className="text-xs text-white font-bold">{session.user?.name || "User"}</p>
                  <p className="text-[10px] text-gray-500 font-mono truncate max-w-[120px]">{session.user?.email}</p>
                </div>
                
                {/* IMAGE LOGIC ADDED HERE */}
                {session.user?.image ? (
                   <img 
                     src={session.user.image} 
                     alt="Profile" 
                     className="w-9 h-9 rounded-full border border-blue-400/30 object-cover shadow-[0_0_10px_rgba(59,130,246,0.3)] hover:shadow-[0_0_15px_rgba(59,130,246,0.5)] transition-all"
                   />
                ) : (
                   <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 border border-blue-400/30 flex items-center justify-center text-white font-bold shadow-[0_0_10px_rgba(59,130,246,0.3)] hover:shadow-[0_0_15px_rgba(59,130,246,0.5)] transition-all">
                     {session.user?.email?.charAt(0).toUpperCase()}
                   </div>
                )}
              </button>

              {/* Dropdown Menu */}
              {isDropdownOpen && (
                <div className="absolute right-0 mt-3 w-48 bg-[#161b22] border border-gray-700 rounded-xl shadow-2xl py-2 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="px-4 py-2 border-b border-gray-800 sm:hidden">
                    <p className="text-white text-xs font-bold truncate">{session.user?.email}</p>
                  </div>
                  
                  <Link 
                    href="/profile" 
                    onClick={() => setIsDropdownOpen(false)}
                    className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition flex items-center gap-2"
                  >
                    Profile
                  </Link>

                  <div className="h-px bg-gray-800 my-1 mx-2" />

                  <button
                    onClick={() => signOut({ callbackUrl: '/' })}
                    className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-900/10 transition flex items-center gap-2"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link 
              href="/auth" 
              className="ml-4 text-sm bg-blue-600 hover:bg-blue-500 px-5 py-2 rounded-lg font-bold transition shadow-[0_0_15px_rgba(59,130,246,0.3)] text-white"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}