import type { EnergyState, Room } from "./types.js";
export declare function computeEnergy(room: Room): EnergyState;
/** recompute + broadcast energy for a room when it changed enough */
export declare function tickEnergy(room: Room): void;
export declare function startEnergyTicks(): void;
//# sourceMappingURL=energy.d.ts.map