import { SpyReconExecution } from "../src/core/execution/intel/SpyReconExecution";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { setup } from "./util/Setup";

let game: Game;
let spyPlayer: Player;
let target: Player;

beforeEach(async () => {
  game = await setup("plains", { infiniteGold: true, instantBuild: true }, [
    new PlayerInfo("spy", PlayerType.Human, null, "spy"),
    new PlayerInfo("target", PlayerType.Human, null, "target"),
  ]);
  while (game.inSpawnPhase()) {
    game.executeNextTick();
  }
  spyPlayer = game.player("spy");
  target = game.player("target");
});

test("spies gradually reveal enemy defenses", () => {
  target.buildUnit(UnitType.DefensePost, game.ref(1, 1), {});
  (game as any).conquer(target as any, game.ref(1, 1));
  const spy = spyPlayer.buildUnit(UnitType.Spy, game.ref(1, 1), {});
  game.addExecution(new SpyReconExecution(spy, 1, 0));
  for (let i = 0; i < 50; i++) {
    game.executeNextTick();
  }
  const report = spyPlayer.intelOn(target)!;
  expect(report.assets.length).toBeGreaterThan(0);
  expect(report.assets[0].type).toBe(UnitType.DefensePost);
});
