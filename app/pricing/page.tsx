"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/context";
import { PLANS, ADDON, type PlanId } from "@/lib/pricing";

interface Me {
  authenticated: boolean;
  plan?: PlanId;
  isAdmin?: boolean;
  credits?: number; // Infinity for admins
}

const FEATURE_KEYS: Record<PlanId, string[]> = {
  free: ["pricing.feature.free1", "pricing.feature.free2"],
  pro: ["pricing.feature.pro1", "pricing.feature.pro2", "pricing.feature.pro3"],
  business: ["pricing.feature.biz1", "pricing.feature.biz2", "pricing.feature.biz3"],
};

export default function PricingPage() {
  const t = useT();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<PlanId | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/me");
      const data = await res.json();
      setMe(data);
    } catch {
      setMe({ authenticated: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleUpgrade = async (plan: PlanId) => {
    if (plan === "free") return;
    setProcessing(plan);
    setMsg(null);
    try {
      const res = await fetch("/api/checkout/mock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data?.error || "error");
      } else {
        setMsg(t("pricing.grantSuccess", { plan, credits: data.credits }));
        await refresh();
      }
    } catch {
      setMsg("network_error");
    } finally {
      setProcessing(null);
    }
  };

  const balanceText =
    me && me.credits === Infinity
      ? t("pricing.unlimited")
      : me
      ? t("pricing.yourBalance", { credits: me.credits ?? 0 })
      : "";

  return (
    <main className="max-w-5xl mx-auto px-4 py-10">
      <Link href="/" className="text-sm text-blue-600 hover:underline">
        ← TrueLens
      </Link>

      <h1 className="text-3xl font-bold mt-4">{t("pricing.title")}</h1>
      <p className="text-gray-500 mt-1">{t("pricing.subtitle")}</p>

      {me?.authenticated && (
        <p className="mt-3 inline-block bg-gray-100 rounded-full px-3 py-1 text-sm">
          {balanceText}
        </p>
      )}

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrent = me?.plan === plan.id;
          const isFree = plan.id === "free";
          return (
            <div
              key={plan.id}
              className={`rounded-2xl border p-6 flex flex-col ${
                plan.highlight ? "border-blue-500 shadow-lg" : "border-gray-200"
              }`}
            >
              <h2 className="text-xl font-semibold">
                {t(`pricing.${plan.id}.name`)}
              </h2>
              <p className="mt-2 text-3xl font-bold">
                {plan.priceCny === 0 ? "¥0" : `¥${plan.priceCny}`}
                <span className="text-base font-normal text-gray-500">
                  {plan.priceCny > 0 ? t("pricing.perMonth") : ""}
                </span>
              </p>
              <p className="mt-1 text-sm text-gray-500">
                {t("pricing.credits", { credits: plan.monthlyCredits })}
              </p>

              <ul className="mt-4 space-y-2 text-sm flex-1">
                {FEATURE_KEYS[plan.id].map((k) => (
                  <li key={k} className="flex gap-2">
                    <span className="text-green-500">✓</span>
                    <span>{t(k)}</span>
                  </li>
                ))}
              </ul>

              <button
                disabled={isCurrent || processing !== null}
                onClick={() => handleUpgrade(plan.id)}
                className={`mt-6 rounded-lg px-4 py-2 text-sm font-medium transition ${
                  isCurrent
                    ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                    : isFree
                    ? "bg-gray-800 text-white hover:bg-gray-700"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                {isCurrent
                  ? t("pricing.cta.current")
                  : isFree
                  ? t("pricing.cta.upgrade")
                  : t("pricing.cta.buy")}
                {processing === plan.id ? `…${t("pricing.processing")}` : ""}
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-sm text-gray-500">{t("pricing.addon")}</p>
      <p className="mt-4 text-xs text-amber-600 bg-amber-50 rounded-lg p-3">
        {t("pricing.mockNotice")}
      </p>

      {msg && (
        <p className="mt-4 text-sm text-center text-blue-700">{msg}</p>
      )}
    </main>
  );
}
