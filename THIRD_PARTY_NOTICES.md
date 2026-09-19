# Third-party notices

## pixel-agents (MIT)

The FlowCredit Swarm Space V0.6 isometric research-facility visual spike
(`apps/web/swarm-space/`) ports one renderer primitive from pixel-agents:

- upstream: `https://github.com/pixel-agents-hq/pixel-agents`
- commit: `3537e140c2094761beae748592aeb92ece8edfdd` (v1.4.1)
- license: MIT, Copyright (c) 2026 Pablo De Lucca

| Upstream path | FlowCredit path | What changed |
| --- | --- | --- |
| `webview-ui/src/office/engine/gameLoop.ts` | `apps/web/swarm-space/game-loop.js` | Ported. The upstream constants import became a local constant; callbacks receive `(dtSeconds, elapsedMs)`; the disposer also reports frame counts for the FPS readout. |

### Removed in the V0.6 redesign

V0.5 also shipped two more ported/adapted files. Both were deleted from
`apps/web/swarm-space/` when the office moved from pixel sprites to vector
drawing, and no copy of them remains in this repository:

- `projection.ts` -> `projection.js` (tile/world projection, `mapOffset`,
  `toWorldX`/`toWorldY`): the spike now draws in one fixed 1600x900 design
  space, so no world projection is needed.
- `spriteCache.ts` -> `sprite-cache.js` (ASCII `{palette, rows}` sprites, the
  `(sprite, zoom)` cache and the "one art pixel becomes zoom x zoom device
  pixels, smoothing off" rasterisation rule): the office now draws vector
  figures and cards with `imageSmoothingEnabled` left at its default.

### Not taken from pixel-agents

No art asset is copied: no character, pet, furniture, floor, wall or tileset
sprite, and no PNG (including `webview-ui/public/characters.png`,
`office.png`, `banner.png`). Every figure and work object in
`apps/web/swarm-space/assets.js` is vector canvas drawing written for FlowCredit
in this repository.

No non-renderer subsystem is imported or adapted: the spike contains no Claude
hook, agent launcher, VS Code extension logic, MCP server, upstream server,
workspace control or session discovery.

### MIT license text

```
MIT License

Copyright (c) 2026 Pablo De Lucca

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```


## Munder Difflin visual adaptation

# Munder Difflin visual code

Source: https://github.com/chaitanyagiri/munder-difflin

Pinned commit: `c7c8921f4491104d342861e32fa214e486442304`

`portrait-art.js` is the upstream procedural character generator, with TypeScript annotations removed. `office-scene.js` adapts the ease-in/out and arcing delivery motion from upstream `MessageEnvelope.ts` to Canvas 2D and FlowCredit fixture transitions. Character frame timing follows `CharacterSprite.ts`. Code is MIT, copyright 2026 Chaitanya Giri; see LICENSE.

No LimeZu tilesets, Tiled maps, Electron host, agent orchestration, hooks or provider configuration are included. Room and furniture drawings are original FlowCredit code.


MIT License

Copyright (c) 2026 Chaitanya Giri

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
