"use client";

import { useState, useRef, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useT } from "@/lib/i18n/context";
import AuthModal from "./AuthModal";

export default function HeaderAuth() {
  const t = useT();
  const { data: session, status } = useSession();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"login" | "signup">("login");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Loading state
  if (status === "loading") {
    return (
      <div className="w-8 h-8 rounded-full bg-slate-200 animate-pulse" />
    );
  }

  // Not logged in
  if (!session?.user) {
    return (
      <>
        <button
          onClick={() => {
            setModalMode("login");
            setModalOpen(true);
          }}
          className="px-3 py-1.5 text-sm font-medium text-slate-700 hover:text-indigo-600 transition-colors min-h-[40px]"
        >
          {t("auth.login")}
        </button>
        <button
          onClick={() => {
            setModalMode("signup");
            setModalOpen(true);
          }}
          className="px-3 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors min-h-[40px]"
        >
          {t("auth.signup")}
        </button>
        <AuthModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          initialMode={modalMode}
        />
      </>
    );
  }

  // Logged in
  const user = session.user;
  const initial = (user.name || user.email || "?")[0].toUpperCase();

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex items-center gap-2 p-1 pr-2 rounded-full hover:bg-slate-100 transition-colors"
        >
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.image}
              alt={user.name || ""}
              className="w-8 h-8 rounded-full"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold">
              {initial}
            </div>
          )}
        </button>

        {menuOpen && (
          <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50">
            {/* User info */}
            <div className="px-4 py-2 border-b border-slate-100">
              <p className="text-sm font-medium text-slate-900 truncate">
                {user.name || user.email}
              </p>
              {user.name && (
                <p className="text-xs text-slate-500 truncate">{user.email}</p>
              )}
              <p className="text-xs text-slate-400 mt-1">{t("auth.signedInAs")}</p>
            </div>

            {/* Menu items */}
            <button
              onClick={() => {
                setMenuOpen(false);
                // TODO: navigate to user dashboard
              }}
              className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              {t("auth.myHistory")}
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                // TODO: navigate to pricing
              }}
              className="w-full text-left px-4 py-2 text-sm text-indigo-600 font-medium hover:bg-slate-50 transition-colors"
            >
              {t("auth.upgradePro")}
            </button>
            <div className="border-t border-slate-100 mt-1 pt-1">
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
              >
                {t("auth.logout")}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
