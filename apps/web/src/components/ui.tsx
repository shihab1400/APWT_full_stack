import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(" ");

const buttonStyles = {
  primary: "bg-primary text-white hover:bg-primary-hover",
  secondary: "border border-border bg-surface text-foreground hover:bg-primary-soft",
  ghost: "text-muted hover:text-foreground hover:bg-primary-soft",
};

type ButtonVariant = keyof typeof buttonStyles;
const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60 disabled:pointer-events-none";

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button className={cx(buttonBase, buttonStyles[variant], className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={cx(buttonBase, buttonStyles[variant], className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cx("rounded-2xl border border-border bg-surface p-6 shadow-sm", className)}
      {...props}
    />
  );
}

export function Field({
  label,
  error,
  hint,
  id,
  className,
  ...props
}: ComponentProps<"input"> & { label: string; error?: string; hint?: string; id: string }) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        className={cx(
          "rounded-lg border bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary-soft",
          error ? "border-danger" : "border-border",
        )}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Alert({ tone = "danger", children }: { tone?: "danger" | "info"; children: ReactNode }) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cx(
        "rounded-lg px-3 py-2 text-sm",
        tone === "danger" ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary",
      )}
    >
      {children}
    </div>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold text-foreground">
      <span
        aria-hidden
        className="grid size-8 place-items-center rounded-full bg-primary-soft text-primary"
      >
        ◎
      </span>
      MindEase Oasis
    </Link>
  );
}
