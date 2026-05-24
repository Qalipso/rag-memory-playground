import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ error: "API not available in portfolio demo" }, { status: 501 });
}

export function POST() {
  return NextResponse.json({ error: "API not available in portfolio demo" }, { status: 501 });
}
