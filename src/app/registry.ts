/**
 * Wires every unit's index.ts. The only place units meet. Units replace the
 * body of their own index.ts; they never edit this file.
 */
import type { UnitFactories } from '@/contracts/units';
import { factory as genUniverse } from '@/gen/universe';
import { factory as genNames } from '@/gen/names';
import { factory as genFold } from '@/gen/fold';
import { factory as genSystem } from '@/gen/system';
import { factory as genPlanet } from '@/gen/planet';
import { factory as atlasLawsets } from '../../atlas/lawsets';
import { factory as rulesSky } from '@/rules/sky';
import { factory as toolsAtlas } from '../../tools/atlas';
import { factory as simSand } from '@/sim/sand';
import { factory as simCiv } from '@/sim/civ';
import { factory as simChronicle } from '@/sim/chronicle';
import { factory as simTimebase } from '@/sim/timebase';
import { factory as renderDive } from '@/render/dive';
import { factory as renderSystem } from '@/render/system';
import { factory as renderPlanet } from '@/render/planet';
import { factory as renderRoom } from '@/render/room';
import { factory as gameLight } from '@/game/light';
import { factory as gameBox } from '@/game/box';
import { factory as gameDive } from '@/game/dive';
import { factory as gameSky } from '@/game/sky';
import { factory as uiRoomBox } from '@/ui/room-box';
import { factory as uiDiveHud } from '@/ui/dive-hud';
import { factory as uiSystemPlanet } from '@/ui/system-planet';
import { factory as platformSave } from '@/platform/save';
import { factory as platformAudio } from '@/platform/audio';
import { factory as platformInput } from '@/platform/input';
import { factory as platformEdgeVoice } from '@/platform/edge-voice';
import { factory as platformPerf } from '@/platform/perf';
import { factory as gameBattle } from '@/game/battle';
import { factory as uiBattle } from '@/ui/battle';
import { factory as gameMerge } from '@/game/merge';
import { factory as uiMirror } from '@/ui/mirror';
import { factory as uiTown } from '@/ui/town';

export const registry: UnitFactories = {
  'gen/universe': genUniverse,
  'gen/names': genNames,
  'gen/fold': genFold,
  'gen/system': genSystem,
  'gen/planet': genPlanet,
  'atlas/lawsets': atlasLawsets,
  'rules/sky': rulesSky,
  'tools/atlas': toolsAtlas,
  'sim/sand': simSand,
  'sim/civ': simCiv,
  'sim/chronicle': simChronicle,
  'sim/timebase': simTimebase,
  'render/dive': renderDive,
  'render/system': renderSystem,
  'render/planet': renderPlanet,
  'render/room': renderRoom,
  'game/light': gameLight,
  'game/box': gameBox,
  'game/dive': gameDive,
  'game/sky': gameSky,
  'ui/room-box': uiRoomBox,
  'ui/dive-hud': uiDiveHud,
  'ui/system-planet': uiSystemPlanet,
  'platform/save': platformSave,
  'platform/audio': platformAudio,
  'platform/input': platformInput,
  'platform/edge-voice': platformEdgeVoice,
  'platform/perf': platformPerf,
  'game/battle': gameBattle,
  'ui/battle': uiBattle,
  'game/merge': gameMerge,
  'ui/mirror': uiMirror,
  'ui/town': uiTown,
};
