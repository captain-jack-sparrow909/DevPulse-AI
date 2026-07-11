import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07080b] disabled:pointer-events-none disabled:opacity-45 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-teal-400 text-zinc-950 shadow-[0_0_28px_-10px_rgba(45,212,191,0.75)] hover:bg-teal-300 hover:shadow-[0_0_32px_-8px_rgba(45,212,191,0.85)]",
        secondary:
          "border border-white/10 bg-white/[0.04] text-zinc-100 hover:border-white/15 hover:bg-white/[0.07]",
        ghost: "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100",
        danger:
          "bg-rose-600/90 text-white shadow-sm hover:bg-rose-500",
        outline:
          "border border-white/12 bg-transparent text-zinc-200 hover:border-teal-500/30 hover:bg-teal-500/[0.06] hover:text-teal-100",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-11 rounded-xl px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  ),
);
Button.displayName = "Button";
