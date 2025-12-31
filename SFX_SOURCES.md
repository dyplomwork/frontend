# Big Win SFX sources (replace the placeholder WAVs)

This project includes **placeholder .wav** sounds in `public/sfx/` so everything works out of the box.

If you want higher-quality casino-style sounds, download MP3s from these free libraries and replace the files:

- Mixkit (free win/casino/impact SFX):
  - https://mixkit.co/free-sound-effects/win/
  - https://mixkit.co/free-sound-effects/casino/
  - https://mixkit.co/free-sound-effects/impact/

- Pixabay (royalty-free MP3 SFX):
  - Casino: https://pixabay.com/sound-effects/search/casino/
  - Win / Winning: https://pixabay.com/sound-effects/search/winning/
  - Coins / counting loops: https://pixabay.com/sound-effects/search/coin/
  - Example loop: https://pixabay.com/sound-effects/coin-dispenser-loop-2-189845/

How to swap to MP3:
1) Put your MP3 files into `public/sfx/` with the same names:
   - bigwin_impact.mp3
   - bigwin_count.mp3
   - bigwin_climax.mp3
   - megawin_impact.mp3
   - megawin_climax.mp3
   - superwin_impact.mp3
   - superwin_climax.mp3
2) In `src/views/PlinkoView.vue`, change `const ext = 'wav'` to `const ext = 'mp3'`.
