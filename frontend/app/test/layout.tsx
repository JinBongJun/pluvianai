export const dynamic = "force-dynamic";

/** Dev-only segment; production is blocked in middleware.ts (not notFound — breaks next build). */
export default function TestLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
