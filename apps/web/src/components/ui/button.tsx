import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#05070c] disabled:pointer-events-none disabled:opacity-45 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "border border-teal-200/20 bg-[linear-gradient(110deg,#42e2cc,#68ead5)] text-[#04110f] shadow-[0_10px_30px_-14px_rgba(69,230,208,0.8),inset_0_1px_0_rgba(255,255,255,0.5)] hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_14px_38px_-14px_rgba(69,230,208,0.9)]",
        secondary:
          "border border-slate-300/[0.12] bg-slate-200/[0.055] text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:-translate-y-0.5 hover:border-teal-300/20 hover:bg-slate-200/[0.09]",
        ghost: "text-slate-400 hover:bg-slate-200/[0.06] hover:text-slate-100",
        danger:
          "bg-rose-600/90 text-white shadow-sm hover:bg-rose-500",
        outline:
          "border border-slate-300/[0.14] bg-black/10 text-slate-200 hover:-translate-y-0.5 hover:border-teal-300/30 hover:bg-teal-300/[0.07] hover:text-teal-100",
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
