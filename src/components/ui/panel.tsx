import * as React from "react";
import { cn } from "cn";

/** White content surface on the tinted canvas. Unlike `Card` it doesn't clip, so sticky children keep working. */
function Panel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="panel"
      className={cn(
        "rounded-2xl bg-card p-4 text-card-foreground shadow-sm ring-1 ring-foreground/5 sm:p-6",
        className,
      )}
      {...props}
    />
  );
}

export { Panel };
