import { Execution, Game, Player, Unit } from "../../game/Game";
import { PseudoRandom } from "../../PseudoRandom";

export class SpyReconExecution implements Execution {
  private mg!: Game;
  private active = true;
  private random: PseudoRandom;

  constructor(
    private spy: Unit,
    private revealChance = 0.3,
    private discoveryChance = 0.05,
  ) {
    this.random = new PseudoRandom(spy.id());
  }

  init(mg: Game): void {
    this.mg = mg;
  }

  tick(): void {
    if (!this.spy.isActive()) {
      this.active = false;
      return;
    }
    const tileOwner = this.mg.owner(this.spy.tile());
    if (!tileOwner.isPlayer()) return;
    const target = tileOwner as Player;
    if (target === this.spy.owner()) return;

    if (this.random.next() < this.revealChance) {
      this.spy.owner().gatherDefenseIntel(target);
    }
    if (this.random.next() < this.discoveryChance) {
      this.spy.delete();
      this.active = false;
    }
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
