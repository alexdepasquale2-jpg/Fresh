// STUB: replace with the real planet generator (unit 05). See README.md.
import type { PlanetGenFactory } from '@/contracts/system';
import { GRID_W, GRID_H } from '@/contracts/system';

export const factory: PlanetGenFactory = () => ({
  surface: (_planet, universe) => {
    const cells = new Uint8Array(GRID_W * GRID_H);
    const ground = universe.materialTable.find((m) => m.kind === 'solid')?.id ?? 0;
    cells.fill(ground, GRID_W * Math.floor(GRID_H / 2));
    return { cells, villageSites: [{ x: GRID_W >> 1, y: (GRID_H >> 1) - 1 }] };
  },
});
