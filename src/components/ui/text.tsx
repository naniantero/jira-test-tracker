import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const textVariants = cva("", {
  variants: {
    variant: {
      body: "text-sm",
      strong: "text-sm font-medium",
      muted: "text-sm text-muted-foreground",
      caption: "text-xs text-muted-foreground",
      code: "font-mono text-xs text-muted-foreground",
      error: "text-sm text-destructive",
    },
    tabular: {
      true: "tabular-nums",
    },
  },
  defaultVariants: {
    variant: "body",
  },
});

function Text({
  className,
  variant = "body",
  tabular,
  render,
  ...props
}: useRender.ComponentProps<"p"> & VariantProps<typeof textVariants>) {
  return useRender({
    defaultTagName: "p",
    props: mergeProps<"p">({ className: cn(textVariants({ variant, tabular }), className) }, props),
    render,
    state: {
      slot: "text",
      variant,
    },
  });
}

export { Text, textVariants };
