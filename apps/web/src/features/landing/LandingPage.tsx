import { Reveal } from "@/shared/ui/Reveal";
import { AttackCards } from "./AttackCards";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { Hero } from "./Hero";
import { KillSwitch } from "./KillSwitch";
import { Stats } from "./Stats";
import { StatusStrip } from "./StatusStrip";
import { TwoShields } from "./TwoShields";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-bg text-fg">
      <Header />
      <Hero />
      <StatusStrip />
      <Reveal>
        <TwoShields />
      </Reveal>
      <Reveal>
        <AttackCards />
      </Reveal>
      <Reveal>
        <KillSwitch />
      </Reveal>
      <Reveal>
        <Stats />
      </Reveal>
      <Footer />
    </div>
  );
}
