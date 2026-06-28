"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Route } from "next";

const userLinks: Array<{ href: Route; label: string }> = [
  { href: "/", label: "首页" },
  { href: "/programs", label: "节目目录" },
  { href: "/my/rss", label: "我的 RSS" },
  { href: "/account", label: "账户" }
];

const adminLinks: Array<{ href: Route; label: string }> = [
  { href: "/admin", label: "后台首页" },
  { href: "/admin/programs", label: "节目管理" },
  { href: "/admin/connectors", label: "Connector 管理" },
  { href: "/admin/sources", label: "Source 管理" },
  { href: "/admin/jobs", label: "任务" },
  { href: "/admin/users", label: "用户管理" },
  { href: "/admin/audience-groups", label: "用户类别" },
  { href: "/admin/rss", label: "RSS 管理" }
];

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

type AuthState = {
  loading: boolean;
  authenticated: boolean;
  isAdmin: boolean;
  email?: string;
};

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const isAdminArea = pathname.startsWith("/admin");
  const isAdminLogin = pathname === "/admin/login";
  const [auth, setAuth] = useState<AuthState>({ loading: true, authenticated: false, isAdmin: false });

  const loginHref: Route = "/login";

  const navLinks = useMemo(() => {
    if (auth.loading) {
      return [] as Array<{ href: Route; label: string }>;
    }

    if (!auth.authenticated) {
      return [{ href: "/login", label: "登录" }] as Array<{ href: Route; label: string }>;
    }

    return auth.isAdmin ? adminLinks : userLinks;
  }, [auth.loading, auth.authenticated, auth.isAdmin]);

  useEffect(() => {
    let disposed = false;

    async function loadAuthState() {
      setAuth({ loading: true, authenticated: false, isAdmin: false });

      const [authResult, adminResult] = await Promise.allSettled([
        fetch(`${apiBase}/auth/me`, { credentials: "include" }),
        fetch(`${apiBase}/admin/me`, { credentials: "include" })
      ]);

      if (disposed) {
        return;
      }

      let authenticated = false;
      let isAdmin = false;
      let email: string | undefined;

      try {
        if (authResult.status === "fulfilled") {
          const authJson = await authResult.value.json();
          if (authResult.value.ok && authJson?.authenticated) {
            authenticated = true;
            email = authJson.user?.email;
          }
        }

        if (adminResult.status === "fulfilled") {
          const adminJson = await adminResult.value.json();
          if (adminResult.value.ok && adminJson?.authenticated) {
            authenticated = true;
            isAdmin = true;
            email = adminJson.user?.email ?? email;
          }
        }
      } catch {
        // Keep best-effort auth state on parse/network failure.
      }

      setAuth({ loading: false, authenticated, isAdmin, email });
    }

    void loadAuthState();
    return () => {
      disposed = true;
    };
  }, [pathname]);

  useEffect(() => {
    if (!auth.loading && auth.isAdmin && !isAdminArea) {
      router.replace("/admin");
    }
  }, [auth.loading, auth.isAdmin, isAdminArea, router]);

  async function logout() {
    const endpoint = auth.isAdmin ? "/admin/auth/logout" : "/auth/logout";
    try {
      await fetch(`${apiBase}${endpoint}`, { method: "POST", credentials: "include" });
    } finally {
      window.location.href = loginHref;
    }
  }

  if (isAdminLogin) {
    return null;
  }

  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4">
        <Link href="/" className="text-lg font-semibold">
          Podcast Hub
        </Link>
        <div className="flex min-w-0 items-center gap-6">
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
            {navLinks.map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-ink">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2 text-xs text-muted">
            {auth.loading ? <span>登录状态检查中...</span> : null}
            {!auth.loading && auth.authenticated ? <span>已登录：{auth.email ?? "-"}</span> : null}
            {!auth.loading && !auth.authenticated ? (
              <Link href={loginHref} className="button-secondary px-2 py-1 text-xs">
                去登录
              </Link>
            ) : null}
            {!auth.loading && auth.authenticated ? (
              <button className="button-secondary px-2 py-1 text-xs" onClick={logout} type="button">
                退出登录
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
