import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") ?? "";

  // Normalize local dev host to avoid cookie/session split between 127.0.0.1 and localhost.
  if (host.startsWith("127.0.0.1")) {
    const origin = `${request.nextUrl.protocol}//localhost${request.nextUrl.port ? `:${request.nextUrl.port}` : ""}`;
    const canonicalUrl = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, origin);
    return new NextResponse(null, {
      status: 307,
      headers: {
        Location: canonicalUrl.toString()
      }
    });
  }

  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  const session = request.cookies.get("ph_session")?.value;
  const isLoginPage = pathname === "/admin/login";

  if (!session && !isLoginPage) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  if (isLoginPage) {
    const targetUrl = request.nextUrl.clone();
    targetUrl.pathname = session ? "/admin" : "/login";
    targetUrl.search = "";
    return NextResponse.redirect(targetUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"]
};
