"use client";

import { useState } from "react";
import { Maximize2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface Props {
  title: string;
  isLoading?: boolean;
  isEmpty?: boolean;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
  onExpand?: () => void;
  /** When false, the expand icon is still shown but clicking prompts an upgrade message. Defaults to true. */
  canExpand?: boolean;
}

export function ChartCard({
  title,
  isLoading,
  isEmpty,
  error,
  children,
  className = "",
  onExpand,
  canExpand = true,
}: Props) {
  const [showUpgradeMsg, setShowUpgradeMsg] = useState(false);

  function handleExpandClick() {
    if (!canExpand) {
      setShowUpgradeMsg(true);
      setTimeout(() => setShowUpgradeMsg(false), 2500);
      return;
    }
    onExpand?.();
  }

  return (
    <Card className={`flex flex-col gap-3 p-4 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-zinc-700">{title}</div>
        {onExpand && (
          <div className="relative">
            <button
              type="button"
              onClick={handleExpandClick}
              className={[
                "rounded p-1 transition-colors",
                canExpand
                  ? "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                  : "cursor-not-allowed text-zinc-300 hover:bg-zinc-50 hover:text-zinc-400",
              ].join(" ")}
              aria-label="Expand chart"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            {showUpgradeMsg && (
              <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-md">
                <p className="text-xs text-zinc-600">
                  Chart expansion is not available on the Starter plan.{" "}
                  <a
                    href="/dashboard/settings/manage-subscription"
                    className="font-medium text-violet-600 hover:text-violet-700"
                  >
                    Upgrade
                  </a>
                </p>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="relative min-h-[260px]">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80">
            <LoadingSpinner size="sm" />
          </div>
        )}
        {!isLoading && error && (
          <div className="flex h-full min-h-[260px] items-center justify-center">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}
        {!isLoading && !error && isEmpty && (
          <div className="flex h-full min-h-[260px] items-center justify-center">
            <p className="text-sm text-zinc-400">No data for selected filters</p>
          </div>
        )}
        {!isLoading && !error && !isEmpty && children}
      </div>
    </Card>
  );
}
