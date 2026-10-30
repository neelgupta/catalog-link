import { isDomainError } from "@cataloglink/core/errors";
import { exchangeCode } from "@cataloglink/core/google";
import { saveOAuthAccount } from "@cataloglink/core/sync";
import { NextResponse, type NextRequest } from "next/server";
import { requireClient } from "@/lib/auth";
import { consumeOAuthState } from "@/lib/google-oauth";

/** Google redirects here after the client approves (or cancels) access. */
export async function GET(request: NextRequest) {
  const { clientId, impersonatedBy } = await requireClient();
  const params = request.nextUrl.searchParams;
  const appUrl = (process.env.APP_URL ?? request.nextUrl.origin).replace(/\/+$/, "");
  const back = (query: string) => NextResponse.redirect(new URL(`/app/sheet?${query}`, appUrl));

  if (!(await consumeOAuthState(params.get("state"), clientId))) return back("error=oauth_state");
  if (params.get("error")) return back("error=oauth_cancelled");
  const code = params.get("code");
  if (!code) return back("error=oauth_failed");

  try {
    const { refreshToken, email } = await exchangeCode(code);
    await saveOAuthAccount(clientId, refreshToken, email);
    if (impersonatedBy) console.info(`[audit] super admin ${impersonatedBy} connected Google for client ${clientId}`);
  } catch (err) {
    if (isDomainError(err)) return back(`error=${encodeURIComponent(err.code)}`);
    console.error("[google-oauth] code exchange failed", err);
    return back("error=oauth_failed");
  }
  return back("connected=google");
}
