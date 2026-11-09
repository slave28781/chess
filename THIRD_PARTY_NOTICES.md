# Third-party notices

This project uses freely licensed chess-piece artwork from the Lichess project.

Upstream repository: https://github.com/lichess-org/lila  
Licensing reference: https://github.com/lichess-org/lila/blob/master/COPYING.md  
Pinned upstream commit: `9ab61b48688f55f61c050b64322707a8c6f88f41`

The application code is licensed separately under GPL-3.0-or-later. The piece
artwork below keeps its original license and attribution.

| Skin id | Upstream path | Author(s) | License |
|---|---|---|---|
| `classic` | `public/piece/cburnett` | Colin M.L. Burnett | GPLv2+ |
| `celtic` | `public/piece/celtic` | Maurizio Monge | MIT |
| `chessnut` | `public/piece/chessnut` | Alexis Luengas | Apache-2.0 |
| `fantasy` | `public/piece/fantasy` | Maurizio Monge | MIT |
| `firi` | `public/piece/firi` | James Faure | CC BY 4.0 |
| `governor` | `public/piece/governor` | Lichess authors and contributors | AGPLv3+ |
| `kiwen-suwi` | `public/piece/kiwen-suwi` | neverRare | CC BY 4.0 |
| `kosal` | `public/piece/kosal` | Lichess authors and contributors | AGPLv3+ |
| `letter` | `public/piece/letter` | usolando / Lichess contributors | AGPLv3+ |
| `merida` | `public/piece/merida` | Armando Hernandez Marroquin | GPLv2+ |
| `mono` | `public/piece/mono` | Thibault Duplessis and Colin M.L. Burnett | GPLv2+ |
| `mpchess` | `public/piece/mpchess` | Maxime Chupin | GPLv3+ |
| `pirouetti` | `public/piece/pirouetti` | pirouetti / Lichess contributors | AGPLv3+ |
| `pixel` | `public/piece/pixel` | therealqtpi / Lichess contributors | AGPLv3+ |
| `rhosgfx` | `public/piece/rhosgfx` | RhosGFX | CC0-1.0 |
| `shapes` | `public/piece/shapes` | flugsio | CC BY-SA 4.0 |
| `spatial` | `public/piece/spatial` | Maurizio Monge | MIT |

The `classic`/cburnett set is vendored in `app/pieces/`. Other sets are
requested from the pinned Lichess commit and cached by the PWA after first use.
The previous AI-generated `ivory`, `marble`, `royal`, `copper`, and
`ocean` piece folders were removed.

Sets that Lichess lists as non-free, freeware-only, or non-commercial are not
included.
