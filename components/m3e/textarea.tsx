import * as React from "react"
import { type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/m3e/cn"

import { inputVariants } from "@/components/m3e/input"

function Textarea({
  className,
  variant,
  ...props
}: React.ComponentProps<"textarea"> &
  Pick<VariantProps<typeof inputVariants>, "variant">) {
  return (
    <textarea
      /* a plain one is bare inside a box that is its field: what dresses a field is not for it */
      data-slot={variant === "plain" ? "plain-textarea" : "textarea"}
      className={cn(
        inputVariants({ variant }),
        "flex field-sizing-content h-auto resize-none",
        variant === "plain" ? "min-h-6 p-0" : "min-h-24 px-4 py-4",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
