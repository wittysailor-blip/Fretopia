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

The main app (`index.html`) is the minimal design: Inter type, ink line art on off-white, strings that move a pixel or two and roll from one string to the next.

Earlier versions: `constellation.html` (glowing night-sky design) and `classic.html` (first light-theme app with lesson path, tanpura, tuner, taal loops).

## Song library

Every melody is stored once as a compact line of movable sargam (`S R G m P D N`, komal in lower case, `.` lower octave, `'` upper octave, `:2` beats). The app turns it into sargam for sitar, harmonium, bansuri and vocals, and into guitar tab in open position. Raag practice (aaroh-avaroh and alankars for 15 raags) is generated from each raag's scale. Rhymes, folk, festive, Western classical and Indian pieces are public-domain melodies.

Popular rock, pop and Bollywood songs are copyrighted and aren't bundled. Users can import their own MIDI files (melody is extracted, key detected, stored on the device).

## Listening

The listening engine (`src/listen.js` in the build workspace) is written for Fretopia from published music-analysis methods. It contains no third-party code, models or reverse-engineered material.

- Capture: an AudioWorklet (ScriptProcessor fallback), with every 512-sample hop analysed and timestamped.
- Onsets: log-magnitude spectral flux with adaptive peak picking. A spectral-flatness gate ignores claps, taps and breath for pitched instruments.
- Pitch: YIN computed with FFT cross-correlation, refined to cents.
- Chords: semitone spectrum, local whitening, non-negative note activations against harmonic templates, chroma, and cosine match against a chord vocabulary.
- Muted strings: the activation of each string's own note in the chord shape.
- Tabla: low-band versus mid-band energy at each onset (bayan, dayan or both).
- Latency: measured from the count-in clicks.

Fake-microphone tests with recorded guitar notes:

| Test | Result |
|---|---|
| Correct notes | 98–100% |
| Notes a whole tone off | 14% |
| Wrong chords | 0% |
| 150 ms late | Scored about 70% and flagged as late |
| 40 cents flat | Measured as 37 cents flat |
| Muted G string in C | Reported as muted |
| Clean chords | No false muted-string reports |

## Files

- `index.html`: the app (no build step)
- `sounds/guitar/`: acoustic guitar note samples
- `fonts/`: Inter (main app); Petaluma Script and Petaluma (constellation version)
- `manifest.webmanifest`, `sw.js`, `icon-*.png`: installable and works offline
- `start.command`: double-click on a Mac to run locally at http://localhost:8000

## Credits

- Guitar samples: University of Iowa Electronic Music Studios recordings, edited by Nicholas Brosowsky ([tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments)), CC BY 3.0
- Fonts: Inter © The Inter Project Authors, SIL Open Font License 1.1 (`fonts/OFL-Inter.txt`); Petaluma and Petaluma Script © Steinberg Media Technologies, SIL Open Font License 1.1 (`fonts/OFL-Petaluma.txt`)
- Classic app instrument photos: Wikimedia Commons (credits inside `classic.html`)
- Guitar line art: Fretopia
