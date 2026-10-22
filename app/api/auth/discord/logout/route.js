import { NextResponse } from "next/server";
import { resellerCookieOptions } from "../../../../../lib/reseller-session";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set("se_reseller", "", { ...resellerCookieOptions(request), maxAge: 0 });
  return response;
}
