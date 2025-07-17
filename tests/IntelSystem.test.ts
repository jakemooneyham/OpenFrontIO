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

test("gatherDefenseIntel reveals defenses", () => {
  target.buildUnit(UnitType.DefensePost, game.ref(1, 1), {});
  const report = spyPlayer.gatherDefenseIntel(target);
  expect(report.assets.length).toBe(1);
  expect(report.assets[0].type).toBe(UnitType.DefensePost);
});
