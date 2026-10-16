# Car Customizer

Web app for viewing and (later) customizing your own 3D car models in the browser.

## Run

```bash
npm install
npm run dev
```

## What works now

- **Upload** by button or drag & drop: `.glb`, `.gltf` (+ `.bin`/textures), `.fbx`, `.obj` (+ `.mtl`/textures), or a `.zip`/folder containing any of them. Draco, Meshopt and KTX2-compressed glTF are supported.
- **Normalize**: the model is auto-oriented from its proportions (height → Y, length → Z), centered, put on the ground and scaled to a real length you enter. Buttons fix orientation when the guess is wrong (e.g. Flip front).
- **360° viewer**: orbit/zoom, turntable, studio reflections, contact shadow, grid.
- **Library**: saved in this browser (IndexedDB) with thumbnail, name and transform. Original files are kept untouched; the transform is re-applied on open.

## Structure

| File | Role |
|---|---|
| `src/lib/loaders.ts` | Unzips uploads, picks the main file, loads any supported format, resolves textures by file name |
| `src/lib/normalize.ts` | Auto-orientation and placement math (pure, no scene mutation) |
| `src/lib/storage.ts` | Only module that touches IndexedDB; swap for a server API later |
| `src/components/Viewer.tsx` | Three.js scene, camera framing, thumbnail capture |
| `src/App.tsx` | App state, import/open/save flows |
