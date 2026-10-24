import "server-only";
import { notFound } from "next/navigation";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

/**
 * Fetch from the Nest API during server rendering. Server components call the
 * API directly instead of going through the /api rewrite. A 404 renders the
 * nearest not-found page.
 */
export async function serverApi<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, { headers: { Accept: "application/json" } });
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`API ${path} responded ${res.status}`);
  return res.json() as Promise<T>;
}
