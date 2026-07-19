import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Next 16 renamed Middleware to Proxy; the convention is a single proxy.ts
// beside `app`. Named `proxy` export, per the docs.

const SESSION_COOKIE = "kh_session";
const PUBLIC_PATHS = ["/login"];

/**
 * An optimistic check only: it tests that a session cookie exists, never that
 * it is valid. Real authorisation happens in each route handler against the
 * database, because the docs are explicit that Proxy is not a session
 * management layer and shouldn't be doing data fetching.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!hasCookie && !isPublic) {
    const url = new URL("/login", request.url);
    // Send them back where they were headed once they're signed in.
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (hasCookie && isPublic) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Page routes only. API routes do their own checks and must return 401 JSON
  // rather than a redirect to an HTML page.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
