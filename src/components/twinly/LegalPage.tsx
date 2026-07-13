import { Link } from "@tanstack/react-router";
import { LEGAL } from "@/lib/legal-config";

export function DraftBanner() {
  return (
    <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs font-medium text-amber-200">
      Draft for legal review — this text is a website-integration draft of the Twinly Legal Policy Suite v2. It is not a substitute for tailored legal advice and remains subject to counsel sign-off (including local counsel in Hong Kong, Singapore, New Zealand, and Australia) before final publication.
    </div>
  );
}

export function Legal({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <article className="mx-auto max-w-3xl">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        <Link to="/legal" className="hover:text-foreground">Legal & policies</Link>
      </p>
      <h1 className="mt-1 font-display text-3xl font-bold">{title}</h1>
      <p className="mt-2 text-xs text-muted-foreground">Last updated: {LEGAL.effectiveDate}</p>
      <div className="mt-4"><DraftBanner /></div>
      {intro && <div className="mt-4 text-sm text-muted-foreground">{intro}</div>}
      <div className="prose prose-invert prose-sm mt-6 max-w-none space-y-4 text-sm text-muted-foreground [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1">
        {children}
      </div>
      <div className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
        Questions about this document? Email{" "}
        <a className="underline" href={`mailto:${LEGAL.contact.support}`}>{LEGAL.contact.support}</a>.
        See the full <Link to="/legal" className="underline">policy index</Link>.
      </div>
    </article>
  );
}
