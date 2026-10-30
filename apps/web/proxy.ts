import { STAFF_COOKIE, verifyStaffSession } from "@cataloglink/core/session";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Early redirects only. Real authorisation happens in lib/auth guards on every page,
 * server action and route handler.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const session = await verifyStaffSession(
    request.cookies.get(STAFF_COOKIE)?.value,
    process.env.SESSION_SECRET ?? "",
  );

  const needsAdmin = pathname.startsWith("/admin");
  // While impersonating, /admin is off-limits until the admin exits from the client dashboard banner.
  if (needsAdmin && session?.imp) return NextResponse.redirect(new URL("/app", request.url));
  const allowed = session && (needsAdmin ? session.role === "SUPER_ADMIN" : true);

  if (!allowed) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/app/:path*"],
};
