import Link from "next/link";

const links = [
  { href: "/", label: "首页" },
  { href: "/register", label: "注册" },
  { href: "/login", label: "登录" },
  { href: "/programs", label: "节目目录" },
  { href: "/my/rss", label: "我的 RSS" },
  { href: "/account", label: "账户" }
];

export function Nav() {
  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold">
          Podcast Hub
        </Link>
        <nav className="flex gap-5 text-sm text-muted">
          {links.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-ink">
              {item.label}
            </Link>
          ))}
          <Link href="/admin/login" className="hover:text-ink">
            后台登录
          </Link>
        </nav>
      </div>
    </header>
  );
}
