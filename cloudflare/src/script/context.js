// Builds the context runScript needs for a map: its scripts, the shared std scripts and shared text.
import { MAPS } from '../generated/maps.js';
import { SCENES } from '../generated/scenes.js';
import * as std from '../generated/scripts/_std.js';
import * as sharedText from '../generated/scripts/_text.js';

const mapNameById = new Map(Object.entries(MAPS).map(([id, m]) => [id, m.name]));

/** Load maps/<mapName>.asm's scripts and wrap them with the shared sources. */
export async function createScriptContext(mapName, state, caller = null) {
  const own = await import(`../generated/scripts/${mapName}.js`);
  return {
    mapName, state, caller,
    sources: [own, std, sharedText],
    sceneLists: SCENES,
    mapNameOf: (id) => {
      const name = mapNameById.get(id);
      if (!name) throw new Error(`unknown map ${id}`);
      return name;
    },
  };
}
