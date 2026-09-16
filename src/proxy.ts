import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Keeps the staff login session fresh. Supabase tokens are short-lived, so this refreshes them
 * on every staff request and writes the new cookies back to the browser.
 * Access itself is decided in the page and route code, never here.
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => {
        for (const { name, value, options } of cookies) {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
      },
    },
  });
  // getClaims refreshes an expiring session (writing new cookies) and verifies the token locally with the
  // project's public signing key, instead of a ~130ms round trip to Supabase Auth on every click.
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  matcher: ["/staff/:path*", "/api/staff/:path*", "/api/owner/:path*"],
};
