import { TileRef, UnitType } from "./Game";

export interface IntelAsset {
  tile: TileRef;
  type: UnitType;
}

export interface IntelReport {
  target: string;
  assets: IntelAsset[];
}
