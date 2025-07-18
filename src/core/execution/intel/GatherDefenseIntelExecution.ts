import { Execution, Game, Player, PlayerID, UnitType } from "../../game/Game";

export class GatherDefenseIntelExecution implements Execution {
  private target: Player | null = null;
  private active = true;

  constructor(
    private requestor: Player,
    private targetID: PlayerID,
  ) {}

  init(mg: Game): void {
    if (!mg.hasPlayer(this.targetID)) {
      console.warn(
        `GatherDefenseIntelExecution target ${this.targetID} not found`,
      );
      this.active = false;
      return;
    }
    this.target = mg.player(this.targetID);
  }

  tick(): void {
    if (this.target === null) {
      throw new Error("GatherDefenseIntelExecution not initialized");
    }
    const spies =
      this.requestor.unitCount(UnitType.Spy) +
      this.requestor.unitCount(UnitType.Satellite);
    if (spies === 0) {
      console.warn("no intel units available");
      this.active = false;
      return;
    }
    this.requestor.gatherDefenseIntel(this.target);
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
