import { ButtonLink, Logo } from "@/components/ui";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <ButtonLink href="/login" variant="ghost">
            Log in
          </ButtonLink>
          <ButtonLink href="/register">Get started</ButtonLink>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-6 px-4 py-16">
        <p className="text-sm font-medium uppercase tracking-wide text-primary">
          AI & expert support for mental health
        </p>
        <h1 className="max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">
          A calm place to talk, reflect, and find the right help.
        </h1>
        <p className="max-w-xl text-lg text-muted">
          Chat with a supportive AI companion any time, check in with a self-assessment, and
          book verified mental-health professionals when you need more.
        </p>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/register">Create a free account</ButtonLink>
          <ButtonLink href="/register?role=DOCTOR" variant="secondary">
            Join as a doctor
          </ButtonLink>
        </div>
        <p className="mt-6 max-w-xl rounded-lg bg-warning-soft px-4 py-3 text-sm">
          In crisis or in danger right now? Call the national emergency number{" "}
          <strong>999</strong>.
        </p>
      </main>
    </div>
  );
}
