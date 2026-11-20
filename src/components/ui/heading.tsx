import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const headingVariants = cva("font-heading font-semibold", {
  variants: {
    variant: {
      page: "text-xl",
      section: "text-sm",
    },
  },
  defaultVariants: {
    variant: "section",
  },
});

const defaultTags = { page: "h1", section: "h3" } as const;

/** The variant sets the look and the default tag; pass `render` (e.g. `render={<h2 />}`) when the outline needs another level. */
function Heading({
  className,
  variant = "section",
  render,
  ...props
}: useRender.ComponentProps<"h2"> & VariantProps<typeof headingVariants>) {
  return useRender({
    defaultTagName: defaultTags[variant ?? "section"],
    props: mergeProps<"h2">({ className: cn(headingVariants({ variant }), className) }, props),
    render,
    state: {
      slot: "heading",
      variant,
    },
  });
}

export { Heading, headingVariants };
