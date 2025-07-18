import { UnitType } from "./Game";
import { TileRef } from "./GameMap";

export interface IntelAsset {
  tile: TileRef;
  type: UnitType;
}

export interface IntelReport {
  target: string;
  assets: IntelAsset[];
}
