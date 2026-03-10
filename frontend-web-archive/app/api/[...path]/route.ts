import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const API_SECRET_KEY = process.env.API_SECRET_KEY || "";

async function proxyRequest(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { path } = await params;
  const backendPath = path.join("/");
  const url = new URL(`${BACKEND_URL}/${backendPath}`);

  // Forward query params
  req.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  // Build headers
  const headers: HeadersInit = {
    "X-User-Id": session.user.id,
    "X-User-Email": session.user.email || "",
    "X-Api-Key": API_SECRET_KEY,
  };

  // Forward content-type for requests with body
  const contentType = req.headers.get("content-type");
  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  // Build fetch options
  const fetchOptions: RequestInit = {
    method: req.method,
    headers,
  };

  // Forward body for non-GET/HEAD requests
  if (req.method !== "GET" && req.method !== "HEAD") {
    const body = await req.text();
    if (body) {
      fetchOptions.body = body;
    }
  }

  try {
    const backendRes = await fetch(url.toString(), fetchOptions);

    // Stream the response back
    const responseHeaders = new Headers();
    backendRes.headers.forEach((value, key) => {
      // Skip hop-by-hop headers
      if (!["transfer-encoding", "connection"].includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });

    const responseBody = await backendRes.text();

    return new NextResponse(responseBody, {
      status: backendRes.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("Proxy error:", error);
    return NextResponse.json(
      { error: "Backend service unavailable" },
      { status: 502 }
    );
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
