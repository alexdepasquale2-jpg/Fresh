/**
 * The units the running app wires, split by when they are needed.
 *
 * `core` is what the first screens (bedroom, box, dive) and the shared context need, and ships
 * in the entry bundle. `lazy` holds screens and renderers that are fetched the first time the
 * player goes there, so the JS downloaded at boot stays under the budget. The surface sims
 * (sim/sand, sim/civ, sim/chronicle) are not here at all: only the sim Worker runs them.
 * registry.ts still lists every unit statically, for the contract tests.
 */
import type { UnitFactories } from '@/contracts/units';
import { factory as genUniverse } from '@/gen/universe';
import { factory as genNames } from '@/gen/names';
import { factory as genFold } from '@/gen/fold';
import { factory as genSystem } from '@/gen/system';
import { factory as genPlanet } from '@/gen/planet';
import { factory as atlasLawsets } from '../../atlas/lawsets';
import { factory as rulesSky } from '@/rules/sky';
import { factory as simTimebase } from '@/sim/timebase';
import { factory as renderDive } from '@/render/dive';
import { factory as renderRoom } from '@/render/room';
import { factory as gameLight } from '@/game/light';
import { factory as gameBox } from '@/game/box';
import { factory as gameDive } from '@/game/dive';
import { factory as gameSky } from '@/game/sky';
import { factory as uiRoomBox } from '@/ui/room-box';
import { factory as uiDiveHud } from '@/ui/dive-hud';
import { factory as platformSave } from '@/platform/save';
import { factory as platformAudio } from '@/platform/audio';
import { factory as platformInput } from '@/platform/input';
import { factory as platformEdgeVoice } from '@/platform/edge-voice';
import { factory as platformPerf } from '@/platform/perf';
import { factory as gameBattle } from '@/game/battle';
import { factory as gameMerge } from '@/game/merge';

type F = UnitFactories;

export const core = {
  'gen/universe': genUniverse,
  'gen/names': genNames,
  'gen/fold': genFold,
  'gen/system': genSystem,
  'gen/planet': genPlanet,
  'atlas/lawsets': atlasLawsets,
  'rules/sky': rulesSky,
  'sim/timebase': simTimebase,
  'render/dive': renderDive,
  'render/room': renderRoom,
  'game/light': gameLight,
  'game/box': gameBox,
  'game/dive': gameDive,
  'game/sky': gameSky,
  'ui/room-box': uiRoomBox,
  'ui/dive-hud': uiDiveHud,
  'platform/save': platformSave,
  'platform/audio': platformAudio,
  'platform/input': platformInput,
  'platform/edge-voice': platformEdgeVoice,
  'platform/perf': platformPerf,
  'game/battle': gameBattle,
  'game/merge': gameMerge,
} satisfies Partial<F>;

export const lazy = {
  'render/system': (): Promise<F['render/system']> => import('@/render/system').then((m) => m.factory),
  'render/planet': (): Promise<F['render/planet']> => import('@/render/planet').then((m) => m.factory),
  'ui/system-planet': (): Promise<F['ui/system-planet']> => import('@/ui/system-planet').then((m) => m.factory),
  'ui/battle': (): Promise<F['ui/battle']> => import('@/ui/battle').then((m) => m.factory),
  'ui/mirror': (): Promise<F['ui/mirror']> => import('@/ui/mirror').then((m) => m.factory),
  'ui/town': (): Promise<F['ui/town']> => import('@/ui/town').then((m) => m.factory),
};
