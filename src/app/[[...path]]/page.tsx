import { PoolApp } from "@/components/PoolApp";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  // Demo mode renders bundled sheet data without signing in. Local development only.
  const demo = process.env.NODE_ENV !== "production" && q.demo !== undefined;
  return <PoolApp demo={demo} loginError={q.login_error ?? null} />;
}
