# Fretopia (phone app preview)

A phone app for learning Indian instruments: harmonium, bansuri, vocals, sitar and tabla. It's an installable web app (PWA), so one codebase runs on a laptop, an Android phone and an iPhone.

## Run it on your Mac

1. Double-click **start.command** in this folder. If macOS blocks it, right-click it, choose Open, then Open again.
2. Your browser opens at `http://localhost:8000`. On a laptop the app sits inside a phone frame.
3. Allow the microphone when a lesson or the tuner asks. Use headphones so the tanpura doesn't leak into the mic.

To stop it, close the Terminal window.

**Test as a real phone app:** in Chrome, open the address bar menu and choose *Install Fretopia*. It then opens in its own window with no browser bar.

**On your phone:** start.command prints a `http://192.168…` address. Open it on a phone on the same Wi-Fi to try the design and the on-screen keys. Phones only allow the microphone over https, so for mic testing on a phone, put the folder on any https host (Netlify Drop, Vercel or GitHub Pages) and use *Add to Home Screen*.

## Shortcuts on a laptop

- Drag the photo cards with the mouse or trackpad to swipe
- Space plays or pauses a lesson; Esc closes it
- A W S E D F T G Y H U J K play the on-screen harmonium (A = Sa); Z X C = mandra Pa, Dha, Ni
- F and J are bayan and dayan in tabla lessons

## What's inside

- `index.html`: the whole app (UI, lessons, pitch detection, synthesised tanpura, harmonium and tabla)
- `img/`: instrument photos from Wikimedia Commons. Credits are in the app under You → Photo credits.
- `manifest.webmanifest`, `sw.js`, `icon-*.png`: what makes it installable and usable offline

## Next steps toward the app stores

Wrap the same folder with Capacitor (`npx cap add android`, `npx cap add ios`) to ship to the Play Store and the App Store. For production mic access on Android, add `RECORD_AUDIO` to the manifest.

## Photo credits

- Harmonium: Niranjan Arminius, CC BY-SA 2.0
- Bansuri set: Vamsivadrevu, CC BY-SA 4.0
- Tanpura (Miraj): Martin Spaink, CC BY-SA 3.0
- Sitar (Miraj): Jan Kraus, public domain
- Tabla: Lestat, GFDL / CC BY-SA 3.0

All photos are from Wikimedia Commons and were cropped for the app.
