"use client";

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const collapsibleTriggerVariants = cva("text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50", {
  variants: {
    variant: {
      row: "gap-2 rounded-lg px-3 py-2.5 hover:bg-accent",
      inline: "gap-2 rounded-md py-1",
    },
  },
  defaultVariants: {
    variant: "row",
  },
});

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger({
  className,
  variant = "row",
  ...props
}: CollapsiblePrimitive.Trigger.Props & VariantProps<typeof collapsibleTriggerVariants>) {
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      data-variant={variant}
      className={cn(collapsibleTriggerVariants({ variant }), className)}
      {...props}
    />
  );
}

function CollapsibleContent({ ...props }: CollapsiblePrimitive.Panel.Props) {
  return <CollapsiblePrimitive.Panel data-slot="collapsible-content" {...props} />;
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent, collapsibleTriggerVariants };
