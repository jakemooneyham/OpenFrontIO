import { JWK } from "jose";
import { z } from "zod/v4";
import {
  Difficulty,
  Duos,
  Game,
  GameMapType,
  GameMode,
  GameType,
  Gold,
  Player,
  PlayerInfo,
  PlayerType,
  Quads,
  TerrainType,
  TerraNullius,
  Tick,
  Trios,
  UnitInfo,
  UnitType,
} from "../game/Game";
import { TileRef } from "../game/GameMap";
import { PlayerView } from "../game/GameView";
import { UserSettings } from "../game/UserSettings";
import { GameConfig, GameID, TeamCountConfig } from "../Schemas";
import { assertNever, simpleHash, within } from "../Util";
import { Config, GameEnv, NukeMagnitude, ServerConfig, Theme } from "./Config";
import { PastelTheme } from "./PastelTheme";
import { PastelThemeDark } from "./PastelThemeDark";

const JwksSchema = z.object({
  keys: z
    .object({
      alg: z.literal("EdDSA"),
      crv: z.literal("Ed25519"),
      kty: z.literal("OKP"),
      x: z.string(),
    })
    .array()
    .min(1),
});

const numPlayersConfig = {
  [GameMapType.GatewayToTheAtlantic]: [80, 60, 40],
  [GameMapType.SouthAmerica]: [70, 50, 40],
  [GameMapType.NorthAmerica]: [80, 60, 50],
  [GameMapType.Africa]: [100, 80, 50],
  [GameMapType.Europe]: [80, 50, 30],
  [GameMapType.Australia]: [50, 40, 30],
  [GameMapType.Iceland]: [50, 40, 30],
  [GameMapType.Britannia]: [50, 40, 30],
  [GameMapType.Asia]: [60, 50, 30],
  [GameMapType.FalklandIslands]: [80, 50, 30],
  [GameMapType.Baikal]: [60, 50, 40],
  [GameMapType.Mena]: [60, 50, 30],
  [GameMapType.Mars]: [50, 40, 30],
  [GameMapType.Oceania]: [30, 20, 10],
  [GameMapType.EastAsia]: [50, 40, 30],
  [GameMapType.FaroeIslands]: [50, 40, 30],
  [GameMapType.DeglaciatedAntarctica]: [50, 40, 30],
  [GameMapType.EuropeClassic]: [80, 30, 50],
  [GameMapType.BetweenTwoSeas]: [40, 50, 30],
  [GameMapType.BlackSea]: [40, 50, 30],
  [GameMapType.Pangaea]: [40, 20, 30],
  [GameMapType.World]: [150, 80, 50],
  [GameMapType.GiantWorldMap]: [150, 100, 60],
  [GameMapType.Halkidiki]: [50, 40, 30],
  [GameMapType.StraitOfGibraltar]: [50, 40, 30],
  [GameMapType.Italia]: [50, 40, 30],
} as const satisfies Record<GameMapType, [number, number, number]>;

export abstract class DefaultServerConfig implements ServerConfig {
  allowedFlares(): string[] | undefined {
    return;
  }
  stripePublishableKey(): string {
    return process.env.STRIPE_PUBLISHABLE_KEY ?? "";
  }
  domain(): string {
    return process.env.DOMAIN ?? "";
  }
  subdomain(): string {
    return process.env.SUBDOMAIN ?? "";
  }
  cloudflareAccountId(): string {
    return process.env.CF_ACCOUNT_ID ?? "";
  }
  cloudflareApiToken(): string {
    return process.env.CF_API_TOKEN ?? "";
  }
  cloudflareConfigPath(): string {
    return process.env.CF_CONFIG_PATH ?? "";
  }
  cloudflareCredsPath(): string {
    return process.env.CF_CREDS_PATH ?? "";
  }

  private publicKey: JWK;
  abstract jwtAudience(): string;
  jwtIssuer(): string {
    const audience = this.jwtAudience();
    return audience === "localhost"
      ? "http://localhost:8787"
      : `https://api.${audience}`;
  }
  async jwkPublicKey(): Promise<JWK> {
    if (this.publicKey) return this.publicKey;
    const jwksUrl = this.jwtIssuer() + "/.well-known/jwks.json";
    console.log(`Fetching JWKS from ${jwksUrl}`);
    const response = await fetch(jwksUrl);
    const result = JwksSchema.safeParse(await response.json());
    if (!result.success) {
      const error = z.prettifyError(result.error);
      console.error("Error parsing JWKS", error);
      throw new Error("Invalid JWKS");
    }
    this.publicKey = result.data.keys[0];
    return this.publicKey;
  }
  otelEnabled(): boolean {
    return (
      Boolean(this.otelEndpoint()) &&
      Boolean(this.otelUsername()) &&
      Boolean(this.otelPassword())
    );
  }
  otelEndpoint(): string {
    return process.env.OTEL_ENDPOINT ?? "";
  }
  otelUsername(): string {
    return process.env.OTEL_USERNAME ?? "";
  }
  otelPassword(): string {
    return process.env.OTEL_PASSWORD ?? "";
  }
  gitCommit(): string {
    return process.env.GIT_COMMIT ?? "";
  }
  r2Endpoint(): string {
    return `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  }
  r2AccessKey(): string {
    return process.env.R2_ACCESS_KEY ?? "";
  }
  r2SecretKey(): string {
    return process.env.R2_SECRET_KEY ?? "";
  }

  r2Bucket(): string {
    return process.env.R2_BUCKET ?? "";
  }

  adminHeader(): string {
    return "x-admin-key";
  }
  adminToken(): string {
    return process.env.ADMIN_TOKEN ?? "dummy-admin-token";
  }
  abstract numWorkers(): number;
  abstract env(): GameEnv;
  turnIntervalMs(): number {
    return 100;
  }
  gameCreationRate(): number {
    return 60 * 1000;
  }

  lobbyMaxPlayers(
    map: GameMapType,
    mode: GameMode,
    numPlayerTeams: TeamCountConfig | undefined,
  ): number {
    const [l, m, s] = numPlayersConfig[map] ?? [50, 30, 20];
    const r = Math.random();
    const base = r < 0.3 ? l : r < 0.6 ? m : s;
    let p = Math.min(mode === GameMode.Team ? Math.ceil(base * 1.5) : base, l);
    if (numPlayerTeams === undefined) return p;
    switch (numPlayerTeams) {
      case Duos:
        p -= p % 2;
        break;
      case Trios:
        p -= p % 3;
        break;
      case Quads:
        p -= p % 4;
        break;
      default:
        p -= p % numPlayerTeams;
        break;
    }
    return p;
  }

  workerIndex(gameID: GameID): number {
    return simpleHash(gameID) % this.numWorkers();
  }
  workerPath(gameID: GameID): string {
    return `w${this.workerIndex(gameID)}`;
  }
  workerPort(gameID: GameID): number {
    return this.workerPortByIndex(this.workerIndex(gameID));
  }
  workerPortByIndex(index: number): number {
    return 3001 + index;
  }
}

export class DefaultConfig implements Config {
  private pastelTheme: PastelTheme = new PastelTheme();
  private pastelThemeDark: PastelThemeDark = new PastelThemeDark();
  constructor(
    private _serverConfig: ServerConfig,
    private _gameConfig: GameConfig,
    private _userSettings: UserSettings | null,
    private _isReplay: boolean,
  ) {}

  stripePublishableKey(): string {
    return process.env.STRIPE_PUBLISHABLE_KEY ?? "";
  }

  isReplay(): boolean {
    return this._isReplay;
  }

  samHittingChance(): number {
    return 0.8;
  }

  samWarheadHittingChance(): number {
    return 0.5;
  }

  traitorDefenseDebuff(): number {
    return 0.5;
  }
  traitorSpeedDebuff(): number {
    return 0.7;
  }
  traitorDuration(): number {
    return 30 * 10; // 30 seconds
  }
  spawnImmunityDuration(): Tick {
    return 5 * 10;
  }

  gameConfig(): GameConfig {
    return this._gameConfig;
  }

  serverConfig(): ServerConfig {
    return this._serverConfig;
  }

  userSettings(): UserSettings {
    if (this._userSettings === null) {
      throw new Error("userSettings is null");
    }
    return this._userSettings;
  }

  difficultyModifier(difficulty: Difficulty): number {
    switch (difficulty) {
      case Difficulty.Easy:
        return 1;
      case Difficulty.Medium:
        return 3;
      case Difficulty.Hard:
        return 9;
      case Difficulty.Impossible:
        return 18;
    }
  }

  cityPopulationIncrease(): number {
    return 250_000;
  }

  falloutDefenseModifier(falloutRatio: number): number {
    // falloutRatio is between 0 and 1
    // So defense modifier is between [5, 2.5]
    return 5 - falloutRatio * 2;
  }
  SAMCooldown(): number {
    return 75;
  }
  SiloCooldown(): number {
    return 75;
  }

  defensePostRange(): number {
    return 30;
  }

  defensePostDefenseBonus(): number {
    return 5;
  }

  defensePostSpeedBonus(): number {
    return 3;
  }

  playerTeams(): TeamCountConfig {
    return this._gameConfig.playerTeams ?? 0;
  }

  spawnNPCs(): boolean {
    return !this._gameConfig.disableNPCs;
  }

  isUnitDisabled(unitType: UnitType): boolean {
    return this._gameConfig.disabledUnits?.includes(unitType) ?? false;
  }

  bots(): number {
    return this._gameConfig.bots;
  }
  instantBuild(): boolean {
    return this._gameConfig.instantBuild;
  }
  infiniteGold(): boolean {
    return this._gameConfig.infiniteGold;
  }
  infiniteTroops(): boolean {
    return this._gameConfig.infiniteTroops;
  }
  trainSpawnRate(numberOfStations: number): number {
    return Math.min(1400, Math.round(20 * Math.pow(numberOfStations, 0.5)));
  }
  trainGold(): Gold {
    return BigInt(10_000);
  }
  trainStationMinRange(): number {
    return 15;
  }
  trainStationMaxRange(): number {
    return 80;
  }
  railroadMaxSize(): number {
    return 100;
  }

  tradeShipGold(dist: number, numPorts: number): Gold {
    const baseGold = Math.floor(50000 + 130 * dist);
    const basePortBonus = 0.2;
    const diminishingFactor = 0.95;

    let totalMultiplier = 1;
    for (let i = 0; i < numPorts; i++) {
      totalMultiplier += basePortBonus * Math.pow(diminishingFactor, i);
    }

    return BigInt(Math.floor(baseGold * totalMultiplier));
  }

  // Chance to spawn a trade ship in one second,
  tradeShipSpawnRate(numTradeShips: number): number {
    if (numTradeShips <= 20) {
      return 5;
    }
    if (numTradeShips > this.tradeShipCap()) {
      return 1_000_000;
    }
    return numTradeShips - 15;
  }

  tradeShipCap(): number {
    return 100;
  }

  unitInfo(type: UnitType): UnitInfo {
    switch (type) {
      case UnitType.TransportShip:
        return {
          cost: () => 0n,
          territoryBound: false,
        };
      case UnitType.Warship:
        return {
          cost: (p: Player) =>
            p.type() === PlayerType.Human && this.infiniteGold()
              ? 0n
              : BigInt(
                  Math.min(
                    1_000_000,
                    (p.unitsOwned(UnitType.Warship) + 1) * 250_000,
                  ),
                ),
          territoryBound: false,
          maxHealth: 1000,
        };
      case UnitType.Shell:
        return {
          cost: () => 0n,
          territoryBound: false,
          damage: 250,
        };
      case UnitType.SAMMissile:
        return {
          cost: () => 0n,
          territoryBound: false,
        };
      case UnitType.Port:
        return {
          cost: (p: Player) =>
            p.type() === PlayerType.Human && this.infiniteGold()
              ? 0n
              : BigInt(
                  Math.min(
                    1_000_000,
                    Math.pow(2, p.unitsConstructed(UnitType.Port)) * 125_000,
                  ),
                ),
          territoryBound: true,
          constructionDuration: this.instantBuild() ? 0 : 2 * 10,
          upgradable: true,
          canBuildTrainStation: true,
        };
      case UnitType.AtomBomb:
        return {
          cost: (p: Player) =>
            p.type() === PlayerType.Human && this.infiniteGold()
              ? 0n
              : 750_000n,
          territoryBound: false,
        };
      case UnitType.HydrogenBomb:
        return {
          cost: (p: Player) =>
            p.type() === PlayerType.Human && this.infiniteGold()
              ? 0n
              : 5_000_000n,
          territoryBound: false,
        };
      case UnitType.MIRV:
        return {
          cost: (p: Player) =>
            p.type() === PlayerType.Human && this.infiniteGold()
              ? 0n
              : 25_000_000n,
          territoryBound: false,
        };
      case UnitType.MIRVWarhead:
        return {
          cost: () => 0n,
          territoryBound: false,
        };
      case UnitType.TradeShip:
        return {
          cost: () => 0n,
          territoryBound: false,
        };
      case UnitType.MissileSilo:
        return {
          cost: (p: Player) =>
            p.type() === PlayerType.Human && this.infiniteGold()
              ? 0n
              : 1_000_000n,
          territoryBound: true,
          constructionDuration: this.instantBuild() ? 0 : 10 * 10,
          upgradable: true,
        };
      case UnitType.DefensePost:
        return {
          cost: (p: Player) =>
            p.type() === PlayerType.Human && this.infiniteGold()
              ? 0n
              : BigInt(
                  Math.min(
                    250_000,
                    (p.unitsConstructed(UnitType.DefensePost) + 1) * 50_000,
                  ),
                ),
          territoryBound: true,
          constructionDuration: this.instantBuild() ? 0 : 5 * 10,
        };
      case UnitType.SAMLauncher:
        return {
          cost: (p: Player) =>
            p.type() === PlayerType.Human && this.infiniteGold()
              ? 0n
              : BigInt(
                  Math.min(
                    3_000_000,
                    (p.unitsConstructed(UnitType.SAMLauncher) + 1) * 1_500_000,
                  ),
                ),
          territoryBound: true,
          constructionDuration: this.instantBuild() ? 0 : 30 * 10,
          upgradable: true,
        };
      case UnitType.City:
        return {
          cost: (p: Player) =>
            p.type() === PlayerType.Human && this.infiniteGold()
              ? 0n
              : BigInt(
                  Math.min(
                    1_000_000,
                    Math.pow(2, p.unitsConstructed(UnitType.City)) * 125_000,
                  ),
                ),
          territoryBound: true,
          constructionDuration: this.instantBuild() ? 0 : 2 * 10,
          upgradable: true,
          canBuildTrainStation: true,
        };
      case UnitType.Factory:
        return {
          cost: (p: Player) =>
            p.type() === PlayerType.Human && this.infiniteGold()
              ? 0n
              : BigInt(
                  Math.min(
                    1_000_000,
                    Math.pow(2, p.unitsConstructed(UnitType.Factory)) * 125_000,
                  ),
                ),
          territoryBound: true,
          constructionDuration: this.instantBuild() ? 0 : 2 * 10,
          canBuildTrainStation: true,
          experimental: true,
          upgradable: true,
        };
      case UnitType.Construction:
        return {
          cost: () => 0n,
          territoryBound: true,
        };
      case UnitType.Train:
        return {
          cost: () => 0n,
          territoryBound: false,
          experimental: true,
        };
      case UnitType.Spy:
        return {
          cost: () => 100000n,
          territoryBound: false,
        };
      case UnitType.Satellite:
        return {
          cost: () => 500000n,
          territoryBound: false,
        };
      default:
        assertNever(type);
    }
  }
  defaultDonationAmount(sender: Player): number {
    return Math.floor(sender.troops() / 3);
  }
  donateCooldown(): Tick {
    return 10 * 10;
  }
  emojiMessageDuration(): Tick {
    return 5 * 10;
  }
  emojiMessageCooldown(): Tick {
    return 5 * 10;
  }
  targetDuration(): Tick {
    return 10 * 10;
  }
  targetCooldown(): Tick {
    return 15 * 10;
  }
  allianceRequestCooldown(): Tick {
    return 30 * 10;
  }
  allianceDuration(): Tick {
    return 600 * 10; // 10 minutes.
  }
  temporaryEmbargoDuration(): Tick {
    return 300 * 10; // 5 minutes.
  }

  percentageTilesOwnedToWin(): number {
    if (this._gameConfig.gameMode === GameMode.Team) {
      return 95;
    }
    return 80;
  }
  boatMaxNumber(): number {
    return 3;
  }
  numSpawnPhaseTurns(): number {
    return this._gameConfig.gameType === GameType.Singleplayer ? 100 : 300;
  }
  numBots(): number {
    return this.bots();
  }
  theme(): Theme {
    return this.userSettings()?.darkMode()
      ? this.pastelThemeDark
      : this.pastelTheme;
  }

  attackLogic(
    gm: Game,
    attackTroops: number,
    attacker: Player,
    defender: Player | TerraNullius,
    tileToConquer: TileRef,
  ): {
    attackerTroopLoss: number;
    defenderTroopLoss: number;
    tilesPerTickUsed: number;
  } {
    let mag = 0;
    let speed = 0;
    const type = gm.terrainType(tileToConquer);
    switch (type) {
      case TerrainType.Plains:
        mag = 80;
        speed = 16.5;
        break;
      case TerrainType.Highland:
        mag = 100;
        speed = 20;
        break;
      case TerrainType.Mountain:
        mag = 120;
        speed = 25;
        break;
      default:
        throw new Error(`terrain type ${type} not supported`);
    }
    if (defender.isPlayer()) {
      for (const dp of gm.nearbyUnits(
        tileToConquer,
        gm.config().defensePostRange(),
        UnitType.DefensePost,
      )) {
        if (dp.unit.owner() === defender) {
          mag *= this.defensePostDefenseBonus();
          speed *= this.defensePostSpeedBonus();
          break;
        }
      }
    }

    if (gm.hasFallout(tileToConquer)) {
      const falloutRatio = gm.numTilesWithFallout() / gm.numLandTiles();
      mag *= this.falloutDefenseModifier(falloutRatio);
      speed *= this.falloutDefenseModifier(falloutRatio);
    }

    if (attacker.isPlayer() && defender.isPlayer()) {
      if (
        attacker.type() === PlayerType.Human &&
        defender.type() === PlayerType.Bot
      ) {
        mag *= 0.8;
      }
      if (
        attacker.type() === PlayerType.FakeHuman &&
        defender.type() === PlayerType.Bot
      ) {
        mag *= 0.8;
      }
    }

    let largeLossModifier = 1;
    if (attacker.numTilesOwned() > 100_000) {
      largeLossModifier = Math.sqrt(100_000 / attacker.numTilesOwned());
    }
    let largeSpeedMalus = 1;
    if (attacker.numTilesOwned() > 75_000) {
      // sqrt is only exponent 1/2 which doesn't slow enough huge players
      largeSpeedMalus = (75_000 / attacker.numTilesOwned()) ** 0.6;
    }

    if (defender.isPlayer()) {
      return {
        attackerTroopLoss:
          within(defender.troops() / attackTroops, 0.6, 2) *
          mag *
          0.8 *
          largeLossModifier *
          (defender.isTraitor() ? this.traitorDefenseDebuff() : 1),
        defenderTroopLoss: defender.troops() / defender.numTilesOwned(),
        tilesPerTickUsed:
          within(defender.troops() / (5 * attackTroops), 0.2, 1.5) *
          speed *
          largeSpeedMalus *
          (defender.isTraitor() ? this.traitorSpeedDebuff() : 1),
      };
    } else {
      return {
        attackerTroopLoss:
          attacker.type() === PlayerType.Bot ? mag / 10 : mag / 5,
        defenderTroopLoss: 0,
        tilesPerTickUsed: within(
          (2000 * Math.max(10, speed)) / attackTroops,
          5,
          100,
        ),
      };
    }
  }

  attackTilesPerTick(
    attackTroops: number,
    attacker: Player,
    defender: Player | TerraNullius,
    numAdjacentTilesWithEnemy: number,
  ): number {
    if (defender.isPlayer()) {
      return (
        within(((5 * attackTroops) / defender.troops()) * 2, 0.01, 0.5) *
        numAdjacentTilesWithEnemy *
        3
      );
    } else {
      return numAdjacentTilesWithEnemy * 2;
    }
  }

  boatAttackAmount(attacker: Player, defender: Player | TerraNullius): number {
    return Math.floor(attacker.troops() / 5);
  }

  warshipShellLifetime(): number {
    return 20; // in ticks (one tick is 100ms)
  }

  radiusPortSpawn() {
    return 20;
  }

  proximityBonusPortsNb(totalPorts: number) {
    return within(totalPorts / 3, 4, totalPorts);
  }

  attackAmount(attacker: Player, defender: Player | TerraNullius) {
    if (attacker.type() === PlayerType.Bot) {
      return attacker.troops() / 20;
    } else {
      return attacker.troops() / 5;
    }
  }

  startManpower(playerInfo: PlayerInfo): number {
    if (playerInfo.playerType === PlayerType.Bot) {
      return 10_000;
    }
    if (playerInfo.playerType === PlayerType.FakeHuman) {
      switch (this._gameConfig.difficulty) {
        case Difficulty.Easy:
          return 2_500 * (playerInfo?.nation?.strength ?? 1);
        case Difficulty.Medium:
          return 5_000 * (playerInfo?.nation?.strength ?? 1);
        case Difficulty.Hard:
          return 20_000 * (playerInfo?.nation?.strength ?? 1);
        case Difficulty.Impossible:
          return 50_000 * (playerInfo?.nation?.strength ?? 1);
      }
    }
    return this.infiniteTroops() ? 1_000_000 : 25_000;
  }

  maxPopulation(player: Player | PlayerView): number {
    const maxPop =
      player.type() === PlayerType.Human && this.infiniteTroops()
        ? 1_000_000_000
        : 2 * (Math.pow(player.numTilesOwned(), 0.6) * 1000 + 50000) +
          player
            .units(UnitType.City)
            .map((city) => city.level())
            .reduce((a, b) => a + b, 0) *
            this.cityPopulationIncrease();

    if (player.type() === PlayerType.Bot) {
      return maxPop / 2;
    }

    if (player.type() === PlayerType.Human) {
      return maxPop;
    }

    switch (this._gameConfig.difficulty) {
      case Difficulty.Easy:
        return maxPop * 0.5;
      case Difficulty.Medium:
        return maxPop * 1;
      case Difficulty.Hard:
        return maxPop * 1.5;
      case Difficulty.Impossible:
        return maxPop * 2;
    }
  }

  populationIncreaseRate(player: Player): number {
    const max = this.maxPopulation(player);

    let toAdd = 10 + Math.pow(player.population(), 0.73) / 4;

    const ratio = 1 - player.population() / max;
    toAdd *= ratio;

    if (player.type() === PlayerType.Bot) {
      toAdd *= 0.7;
    }

    if (player.type() === PlayerType.FakeHuman) {
      switch (this._gameConfig.difficulty) {
        case Difficulty.Easy:
          toAdd *= 0.9;
          break;
        case Difficulty.Medium:
          toAdd *= 1;
          break;
        case Difficulty.Hard:
          toAdd *= 1.1;
          break;
        case Difficulty.Impossible:
          toAdd *= 1.2;
          break;
      }
    }

    return Math.min(player.population() + toAdd, max) - player.population();
  }

  goldAdditionRate(player: Player): Gold {
    return BigInt(Math.floor(0.045 * player.workers() ** 0.7));
  }

  troopAdjustmentRate(player: Player): number {
    const maxDiff = this.maxPopulation(player) / 1000;
    const target = player.population() * player.targetTroopRatio();
    const diff = target - player.troops();
    if (Math.abs(diff) < maxDiff) {
      return diff;
    }
    const adjustment = maxDiff * Math.sign(diff);
    // Can ramp down troops much faster
    if (adjustment < 0) {
      return adjustment * 5;
    }
    return adjustment;
  }

  nukeMagnitudes(unitType: UnitType): NukeMagnitude {
    switch (unitType) {
      case UnitType.MIRVWarhead:
        return { inner: 12, outer: 18 };
      case UnitType.AtomBomb:
        return { inner: 12, outer: 30 };
      case UnitType.HydrogenBomb:
        return { inner: 80, outer: 100 };
    }
    throw new Error(`Unknown nuke type: ${unitType}`);
  }

  defaultNukeSpeed(): number {
    return 6;
  }

  defaultNukeTargetableRange(): number {
    return 120;
  }

  defaultSamRange(): number {
    return 80;
  }

  // Humans can be population, soldiers attacking, soldiers in boat etc.
  nukeDeathFactor(humans: number, tilesOwned: number): number {
    return (5 * humans) / Math.max(1, tilesOwned);
  }

  structureMinDist(): number {
    return 15;
  }

  shellLifetime(): number {
    return 50;
  }

  warshipPatrolRange(): number {
    return 100;
  }

  warshipTargettingRange(): number {
    return 130;
  }

  warshipShellAttackRate(): number {
    return 20;
  }

  defensePostShellAttackRate(): number {
    return 100;
  }

  safeFromPiratesCooldownMax(): number {
    return 20;
  }

  defensePostTargettingRange(): number {
    return 75;
  }

  allianceExtensionPromptOffset(): number {
    return 300; // 30 seconds before expiration
  }
}
