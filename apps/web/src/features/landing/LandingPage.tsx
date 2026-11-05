import { AttackCards } from "./AttackCards";
import { Footer } from "./Footer";
import { Hero } from "./Hero";
import { KillSwitch } from "./KillSwitch";
import { Stats } from "./Stats";
import { Ticker } from "./Ticker";
import { TwoShields } from "./TwoShields";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-bg text-fg">
      <Hero />
      <Ticker />
      <TwoShields />
      <AttackCards />
      <KillSwitch />
      <Stats />
      <Footer />
    </div>
  );
}
