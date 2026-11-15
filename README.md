# Fretopia

A phone app for learning Indian music and guitar: pick an instrument, play along with songs, and get live feedback through your mic.

**Live:** https://fretopia.vercel.app. Open it on your phone and use *Add to Home Screen*. The mic works because the link is https.

## The flow

1. **Landing:** the fretopia wordmark over a guitar neck. Strum the strings; each one responds to how hard and where you strike it.
2. **Pick your instrument:** swipe through guitar, sitar, harmonium, tabla, bansuri and vocals (tanpura). Each card is playable.
3. **Instrument home:** what to play next, *Songs for you* and *Warm-ups*, with stars for each.
4. **Play-along** (Yousician-style):
   - Notes scroll toward a line, after a 4-beat count-in.
   - **Guitar:** a tab view with fret numbers on six strings.
   - **Sitar, harmonium, bansuri, vocals:** sargam rows.
   - **Tabla:** bayan and dayan lanes.
   - **Mic mode:** pitch detection (YIN) scores each note.
   - **Tap mode:** for when there's no instrument nearby.
   - **Options:** *Wait for me* pauses until you hit the note. You can also slow it to 50% or 75%, turn on the melody guide, or tap *Hear it first*.
   - **After a song:** stars, accuracy, best streak and a note-by-note chart.

`classic.html` is the earlier light-theme app (lesson path, tanpura, tuner, taal loops).

## Files

- `index.html`: the app (no build step)
- `sounds/guitar/`: acoustic guitar note samples
- `fonts/`: Petaluma Script wordmark and Petaluma music glyphs (subset)
- `manifest.webmanifest`, `sw.js`, `icon-*.png`: installable and works offline
- `start.command`: double-click on a Mac to run locally at http://localhost:8000

## Credits

- Guitar samples: University of Iowa Electronic Music Studios recordings, edited by Nicholas Brosowsky ([tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments)), CC BY 3.0
- Fonts: Petaluma and Petaluma Script © Steinberg Media Technologies, SIL Open Font License 1.1 (`fonts/OFL-Petaluma.txt`)
- Classic app instrument photos: Wikimedia Commons (credits inside `classic.html`)
- Guitar line art: Fretopia
