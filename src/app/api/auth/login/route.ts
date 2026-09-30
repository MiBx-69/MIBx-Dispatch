import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/redis";

function sanitizeRedirectUrl(url: string | null | undefined): string {
  if (!url || typeof url !== "string") return "/";
  const trimmed = url.trim();
  // Must start with single slash, not protocol-relative (//) or Windows path (/\)
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return "/";
  }
  // Prevent redirect to API endpoints or containing external protocol
  if (trimmed.startsWith("/api/") || trimmed.includes("://")) {
    return "/";
  }
  return trimmed;
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
  const rateLimitKey = `ratelimit:login:${ip}`;
  const { allowed } = await checkRateLimit(rateLimitKey, 10, 60);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Please wait 60 seconds and try again." },
      { status: 429 }
    );
  }

  const formData = await request.formData();
  const email = (formData.get("email") as string)?.trim() || "";
  const password = (formData.get("password") as string) || "";
  const redirectTo = sanitizeRedirectUrl(formData.get("redirectTo") as string);

  if (!email || !password) {
    return NextResponse.redirect(
      new URL(`/login?error=invalid_credentials&redirectTo=${encodeURIComponent(redirectTo)}`, request.url),
      303
    );
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=invalid_credentials&redirectTo=${encodeURIComponent(redirectTo)}`, request.url),
      303
    );
  }

  return NextResponse.redirect(new URL(redirectTo, request.url), 303);
}
