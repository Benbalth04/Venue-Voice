"use client";

import { Card } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface Props {
  title: string;
  isLoading?: boolean;
  isEmpty?: boolean;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}

export function ChartCard({
  title,
  isLoading,
  isEmpty,
  error,
  children,
  className = "",
}: Props) {
  return (
    <Card className={`flex flex-col gap-3 p-4 ${className}`}>
      <div className="text-sm font-semibold text-zinc-700">{title}</div>
      <div className="relative min-h-[200px]">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80">
            <LoadingSpinner size="sm" />
          </div>
        )}
        {!isLoading && error && (
          <div className="flex h-full min-h-[200px] items-center justify-center">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}
        {!isLoading && !error && isEmpty && (
          <div className="flex h-full min-h-[200px] items-center justify-center">
            <p className="text-sm text-zinc-400">No data for selected filters</p>
          </div>
        )}
        {!isLoading && !error && !isEmpty && children}
      </div>
    </Card>
  );
}
