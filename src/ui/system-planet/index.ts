// Solar system and Planet screens (unit 23). The player only ever changes the sky.
import './notable.css';
import './sky.css';
import './screens.css';
import { system } from './system';
import { planet } from './planet';

export const factory = () => ({ system, planet });
