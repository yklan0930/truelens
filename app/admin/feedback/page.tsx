import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { serverT, detectLocale, type ServerLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAdminEmail(email: string): boolean {
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

function fmtContext(ctx: any, t: (key: string, params?: Record<string, string | number>) => string): string {
  if (!ctx) return "—";
  const parts: string[] = [];
  if (ctx.aiProbability != null) {
    const pct = Number(ctx.aiProbability);
    parts.push(t("admin.aiSmell", { value: isFinite(pct) ? (pct * 100).toFixed(0) : pct }));
  }
  if (ctx.verdict) parts.push(String(ctx.verdict));
  if (ctx.fileName) parts.push(String(ctx.fileName));
  return parts.join(" · ") || "—";
}

export default async function AdminFeedbackPage() {
  const h = await headers();
  const locale: ServerLocale = detectLocale(h.get("accept-language"));
  const t = (key: string, params?: Record<string, string | number>) =>
    serverT(locale, key, params);

  const session = await auth();
  const email = (session?.user?.email || "").toLowerCase();
  const isAdmin = !!session?.user?.isAdmin || isAdminEmail(email);
  if (!isAdmin) redirect("/");

  const items = await prisma.feedback.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <main className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t("admin.feedbackTitle")}</h1>
        <Link href="/" className="text-sm text-indigo-600 hover:underline">
          {t("admin.back")}
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="text-slate-500">{t("admin.empty")}</p>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left p-3 whitespace-nowrap">{t("admin.time")}</th>
                <th className="text-left p-3">{t("admin.type")}</th>
                <th className="text-left p-3">{t("admin.rating")}</th>
                <th className="text-left p-3">{t("admin.message")}</th>
                <th className="text-left p-3">{t("admin.context")}</th>
                <th className="text-left p-3">{t("admin.email")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it: any) => (
                <tr key={it.id} className="border-t hover:bg-slate-50">
                  <td className="p-3 whitespace-nowrap text-slate-500">
                    {new Date(it.createdAt).toLocaleString()}
                  </td>
                  <td className="p-3">{it.type}</td>
                  <td className="p-3">{it.rating || "—"}</td>
                  <td className="p-3 max-w-xs whitespace-pre-wrap align-top">
                    {it.message || "—"}
                  </td>
                  <td className="p-3 max-w-xs text-slate-500 align-top">
                    {fmtContext(it.resultContext, t)}
                  </td>
                  <td className="p-3 text-slate-500 whitespace-nowrap">
                    {it.email || t("admin.anonymous")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
