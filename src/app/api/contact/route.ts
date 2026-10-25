// Contact form endpoint. Stores messages in Neon Postgres when DATABASE_URL
// is set (see README); otherwise it just logs them on the server.
import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { name?: string; email?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = (body.name ?? "").trim().slice(0, 120);
  const email = (body.email ?? "").trim().slice(0, 200);
  const message = (body.message ?? "").trim().slice(0, 5000);
  if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Please fill in name, a valid email and a message." }, { status: 400 });
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("[contact] (no DATABASE_URL set)", { name, email, message });
    return NextResponse.json({ ok: true, stored: false });
  }

  try {
    const sql = neon(url);
    await sql`CREATE TABLE IF NOT EXISTS contact_messages (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )`;
    await sql`INSERT INTO contact_messages (name, email, message) VALUES (${name}, ${email}, ${message})`;
    return NextResponse.json({ ok: true, stored: true });
  } catch (err) {
    console.error("[contact] database error", err);
    return NextResponse.json({ error: "Could not save your message." }, { status: 500 });
  }
}
