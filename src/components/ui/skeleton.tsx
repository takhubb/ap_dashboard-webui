import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-xl bg-[linear-gradient(120deg,rgba(223,228,234,0.65),rgba(245,247,250,0.9),rgba(223,228,234,0.65))] bg-[length:200%_100%]",
        className,
      )}
      {...props}
    />
  );
}

