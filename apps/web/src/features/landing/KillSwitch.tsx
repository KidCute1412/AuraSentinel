import { Power } from "lucide-react";
import { Chamfer } from "@/shared/ui/Chamfer";

export function KillSwitch() {
  return (
    <section className="border-b border-line">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-6 py-20 md:flex-row md:items-center md:justify-between">
        <div className="max-w-2xl">
          <span className="mono-label">03 · Kill-Switch · armed</span>
          <h2 className="mt-2 text-3xl md:text-4xl">
            Shut the server down. The Kill button still works.
          </h2>
          <p className="mt-4 text-lg text-soft">
            You sign the revoke in your own browser, straight to the chain. No
            backend in the loop. Access is cut in about{" "}
            <span className="tabular text-fg">1.5s</span>.
          </p>
        </div>
        <Chamfer edge="bg-danger" fill="bg-tint-pink" innerClassName="flex items-center gap-3 px-6 py-5">
          <Power aria-hidden className="size-8 text-danger" />
          <span className="tabular text-2xl font-bold">~1.5s</span>
        </Chamfer>
      </div>
    </section>
  );
}
