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
  const [processing, setProcessing] = useState<string | null>(null);
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

  const handlePurchase = async (productKey: string) => {
    // Free "upgrade" → buy Pro
    const actualKey = productKey === "free" ? "pro" : productKey;
    setProcessing(productKey);
    setMsg(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productKey: actualKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data?.error || "error");
      } else if (data.mode === "redirect" && data.url) {
        // Real Polar checkout — send the user to Polar's hosted page.
        window.location.href = data.url;
        return; // page navigates away; no need to reset processing
      } else {
        setMsg(t("pricing.grantSuccess", { plan: productKey, credits: data.credits }));
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
          // Free users can always "upgrade" to Pro; only non-free plans show disabled "current"
          const disableButton = !isFree && isCurrent;
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
                disabled={disableButton || processing !== null}
                onClick={() => handlePurchase(plan.id)}
                className={`mt-6 rounded-lg px-4 py-2 text-sm font-medium transition ${
                  disableButton
                    ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                    : isFree
                    ? "bg-indigo-600 text-white hover:bg-indigo-700"
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

      <div className="mt-6 flex items-center justify-between rounded-2xl border border-gray-200 p-6">
        <div>
          <h3 className="font-semibold">{t("pricing.addon")}</h3>
          <p className="mt-1 text-sm text-gray-500">
            {t("pricing.credits", { credits: ADDON.credits })}
          </p>
        </div>
        <button
          disabled={processing !== null}
          onClick={() => handlePurchase("addon")}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {`¥${ADDON.priceCny}`}
          {processing === "addon" ? `…${t("pricing.processing")}` : ""}
        </button>
      </div>
      <p className="mt-4 text-xs text-amber-600 bg-amber-50 rounded-lg p-3">
        {t("pricing.mockNotice")}
      </p>

      {msg && (
        <p className="mt-4 text-sm text-center text-blue-700">{msg}</p>
      )}
    </main>
  );
}
