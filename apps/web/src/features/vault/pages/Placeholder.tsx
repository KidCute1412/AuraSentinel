import { Chamfer } from "@/shared/ui/Chamfer";

/** Route is wired and guarded; the real content lands in a later build step (see ui-pages.md §10). */
export function Placeholder({ title, blurb, code }: { title: string; blurb: string; code: string }) {
  return (
    <Chamfer code={code} edge="bg-line-strong" innerClassName="p-6 pb-10 sm:p-8 sm:pb-12">
      <span className="mono-label">STATUS: ROUTE READY · CONTENT PENDING</span>
      <h2 className="mt-3 text-2xl">{title}</h2>
      <p className="mt-2 max-w-2xl text-soft">{blurb}</p>
    </Chamfer>
  );
}
