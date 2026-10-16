import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import type * as THREE from 'three'
import Viewer, { type CaptureFn } from './components/Viewer'
import ModelPanel from './components/ModelPanel'
import Library from './components/Library'
import ViewToolbar from './components/ViewToolbar'
import Minimap from './components/Minimap'
import FlyHud from './components/FlyHud'
import { createHudState } from './lib/hud'
import SettingsDialog from './components/SettingsDialog'
import { loadSettings, saveSettings, type Settings } from './lib/settings'
import { pointerLockBusy } from './lib/pointerLock'
import { VIEWS, type CameraMode, type CameraView, type ViewRequest } from './lib/camera'
import { ACCEPT, countGeometry, expandFiles, extOf, loadModel, pickMainFile } from './lib/loaders'
import { autoOrient, computePlacement, measureBounds } from './lib/normalize'
import { deleteModel, getModelFiles, listModels, saveModel, storageUsage } from './lib/storage'
import { filesFromDrop } from './lib/dropFiles'
import PartsPanel from './components/PartsPanel'
import type { GizmoMode, PickMode, SceneApi } from './components/PartsLayer'
import type { PanelTab } from './components/ModelPanel'
import { emptyBuild, indexMeshes, type Build, type PartInstance, type Vec3 } from './lib/build'
import { CATALOG, defaultParams } from './parts/catalog'
import type { ModelRecord, ModelTransform, StoredFile } from './lib/types'

const DEFAULT_LENGTH = 4.5
const EMPTY_BUILD = emptyBuild()

/** The model currently open in the viewer, saved or not. */
export interface OpenModel {
  key: string
  savedId?: string
  createdAt?: number
  name: string
  format: string
  mainFile: string
  files: StoredFile[]
  raw: THREE.Object3D
  bounds: THREE.Box3
  transform: ModelTransform
  build: Build
  missing: string[]
  dirty: boolean
  dispose: () => void
}

export default function App() {
  const [library, setLibrary] = useState<ModelRecord[]>([])
  const [usage, setUsage] = useState<number>()
  const [current, setCurrent] = useState<OpenModel | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [autoRotate, setAutoRotate] = useState(true)
  const [showGrid, setShowGrid] = useState(false)
  const [cameraMode, setCameraMode] = useState<CameraMode>('orbit')
  const [viewRequest, setViewRequest] = useState<ViewRequest | null>(null)
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [panelTab, setPanelTab] = useState<PanelTab>('model')
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null)
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>('translate')
  const [pickMode, setPickMode] = useState<PickMode>(null)
  const sceneApiRef = useRef<SceneApi | null>(null)
  const hudRef = useRef(createHudState())
  // The side panel floats over the 3D view on wide screens (it becomes a bottom sheet on phones).
  const [wideStage, setWideStage] = useState(() => window.matchMedia('(min-width: 761px)').matches)
  useEffect(() => {
    const query = window.matchMedia('(min-width: 761px)')
    const onChange = () => setWideStage(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  const cameraModeRef = useRef(cameraMode)
  cameraModeRef.current = cameraMode
  const captureRef = useRef<CaptureFn | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const refreshLibrary = useCallback(async () => {
    setLibrary(await listModels())
    setUsage(await storageUsage())
  }, [])

  useEffect(() => {
    refreshLibrary().catch((e) => setError(String(e)))
  }, [refreshLibrary])

  useEffect(() => saveSettings(settings), [settings])
  const updateSettings = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), [])
  const setFlySpeed = useCallback((flySpeed: number) => updateSettings({ flySpeed }), [updateSettings])

  const placement = useMemo(
    () => (current ? computePlacement(current.bounds, current.transform) : null),
    [current?.bounds, current?.transform], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const stats = useMemo(() => (current ? countGeometry(current.raw) : null), [current?.raw]) // eslint-disable-line react-hooks/exhaustive-deps
  const meshIndex = useMemo(() => (current ? indexMeshes(current.raw) : null), [current?.raw]) // eslint-disable-line react-hooks/exhaustive-deps

  // Any deliberate camera move stops the turntable, otherwise it spins away from the chosen view.
  const changeCameraMode = useCallback((mode: CameraMode) => {
    if (mode === 'fly') setAutoRotate(false)
    setCameraMode(mode)
  }, [])
  type CameraMove = { view: CameraView } | { dir: [number, number, number] } | { position: [number, number, number]; target: [number, number, number] }
  const moveCamera = useCallback((move: CameraMove, toOrbit = true) => {
    setAutoRotate(false)
    if (toOrbit) setCameraMode('orbit')
    setViewRequest((prev) => ({ ...move, n: (prev?.n ?? 0) + 1 }))
  }, [])
  const requestView = useCallback((view: CameraView) => moveCamera({ view }), [moveCamera])
  const requestDirection = useCallback((dir: [number, number, number]) => moveCamera({ dir }), [moveCamera])

  /** Minimap click: go to that ground point at the current height and look at the car (stays in free cam). */
  const moveCameraTo = useCallback(
    (x: number, z: number) => {
      const { dims, position } = hudRef.current
      const [, h, l] = dims
      const minDistance = l * 0.6
      const distance = Math.hypot(x, z)
      if (distance < minDistance) {
        const [dx, dz] = distance > 1e-3 ? [x / distance, z / distance] : [0, 1]
        x = dx * minDistance
        z = dz * minDistance
      }
      moveCamera({ position: [x, Math.max(position.y, 0.4), z], target: [0, h * 0.45, 0] }, false)
    },
    [moveCamera],
  )
  const focusOrbit = useCallback(() => {
    setAutoRotate(false)
    setCameraMode('orbit')
  }, [])

  // Camera shortcuts: F free cam, Esc orbit, 1–6 preset views.
  const hasModel = !!current
  useEffect(() => {
    if (!hasModel) return
    const views = Object.keys(VIEWS) as CameraView[]
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable], dialog')
      if (typing || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      if (e.code === 'KeyF') changeCameraMode(cameraModeRef.current === 'fly' ? 'orbit' : 'fly')
      // Esc steps back one level: cancel picking → deselect part → leave free cam.
      // The first Esc in a locked free cam only releases the mouse (the browser does that itself).
      else if (e.code === 'Escape' && !pointerLockBusy()) {
        const { pickMode, selectedPartId } = partsKeys.current
        if (pickMode) setPickMode(null)
        else if (selectedPartId && cameraModeRef.current === 'orbit') setSelectedPartId(null)
        else setCameraMode('orbit')
      } else if ((e.code === 'Delete' || e.code === 'Backspace') && partsKeys.current.selectedPartId) {
        partsKeys.current.removePart(partsKeys.current.selectedPartId)
      }
      else if (e.code === 'KeyM') setSettings((s) => ({ ...s, showMinimap: !s.showMinimap }))
      else if (/^Digit[1-9]$/.test(e.code) && views[Number(e.code.slice(5)) - 1]) {
        requestView(views[Number(e.code.slice(5)) - 1])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hasModel, requestView, changeCameraMode])

  const open = (next: OpenModel) => {
    setCameraMode('orbit')
    setSelectedPartId(null)
    setPickMode(null)
    setCurrent((prev) => {
      if (prev && prev.raw !== next.raw) prev.dispose()
      return next
    })
  }

  const run = async (label: string, task: () => Promise<void>) => {
    setBusy(label)
    setError(null)
    try {
      await task()
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const importFiles = (input: File[]) =>
    run('Loading model…', async () => {
      const files = await expandFiles(input)
      const main = pickMainFile(files)
      const loaded = await loadModel(files, main.name)
      const bounds = measureBounds(loaded.object)
      open({
        key: crypto.randomUUID(),
        name: main.name.split('/').pop()!.replace(/\.[^.]+$/, ''),
        format: extOf(main.name),
        mainFile: main.name,
        files,
        raw: loaded.object,
        bounds,
        transform: { rotation: autoOrient(bounds), targetLength: DEFAULT_LENGTH },
        build: emptyBuild(),
        missing: loaded.missing,
        dirty: true,
        dispose: loaded.dispose,
      })
    })

  const openSaved = (record: ModelRecord) =>
    run(`Opening ${record.name}…`, async () => {
      const files = await getModelFiles(record.id)
      const loaded = await loadModel(files, record.mainFile)
      open({
        key: record.id,
        savedId: record.id,
        createdAt: record.createdAt,
        name: record.name,
        format: record.format,
        mainFile: record.mainFile,
        files,
        raw: loaded.object,
        bounds: measureBounds(loaded.object),
        transform: record.transform,
        build: record.build ?? emptyBuild(),
        missing: loaded.missing,
        dirty: false,
        dispose: loaded.dispose,
      })
    })

  const save = () =>
    current &&
    placement &&
    stats &&
    run('Saving…', async () => {
      const now = Date.now()
      const id = current.savedId ?? crypto.randomUUID()
      const record: ModelRecord = {
        id,
        name: current.name.trim() || 'Untitled car',
        format: current.format,
        mainFile: current.mainFile,
        transform: current.transform,
        stats: {
          ...stats,
          sizeBytes: current.files.reduce((sum, f) => sum + f.blob.size, 0),
          dimensions: placement.dimensions,
        },
        build: current.build,
        thumbnail: captureRef.current?.(),
        createdAt: current.createdAt ?? now,
        updatedAt: now,
      }
      // Original files are immutable, so they're written only on the first save.
      await saveModel(record, current.savedId ? undefined : current.files)
      setCurrent((c) => (c ? { ...c, savedId: id, createdAt: record.createdAt, dirty: false } : c))
      await refreshLibrary()
    })

  const remove = (record: ModelRecord) => {
    if (!confirm(`Delete "${record.name}" from your library? This can't be undone.`)) return
    run('Deleting…', async () => {
      await deleteModel(record.id)
      if (current?.savedId === record.id) {
        current.dispose()
        setCurrent(null)
      }
      await refreshLibrary()
    })
  }

  const update = (patch: Partial<Pick<OpenModel, 'name' | 'transform'>>) =>
    current && setCurrent({ ...current, ...patch, dirty: true })

  // ── Parts / build editing ──
  const updateBuild = (fn: (build: Build) => Build) =>
    setCurrent((c) => (c ? { ...c, build: fn(c.build), dirty: true } : c))
  const updatePart = (id: string, patch: Partial<PartInstance>) =>
    updateBuild((b) => ({ ...b, parts: b.parts.map((part) => (part.id === id ? { ...part, ...patch } : part)) }))

  const addPart = (kind: string) => {
    const def = CATALOG[kind]
    if (!def || !placement) return
    const dims = placement.dimensions
    const { x, z } = def.anchor(dims)
    const y = sceneApiRef.current?.surfaceBelow(x, z) ?? dims[1] * 0.75
    const part: PartInstance = {
      id: crypto.randomUUID(),
      kind,
      params: defaultParams(def, dims),
      position: [x, y, z],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      finish: { ...def.defaultFinish },
    }
    updateBuild((b) => ({ ...b, parts: [...b.parts, part] }))
    setSelectedPartId(part.id)
    setGizmoMode('translate')
    setPanelTab('parts')
    // Swing the camera to a 3/4 view of the end of the car where the part landed.
    moveCamera({ dir: [0.95, 0.5, z < 0 ? -1.05 : 1.05] })
  }

  const removePart = (id: string) => {
    updateBuild((b) => ({ ...b, parts: b.parts.filter((part) => part.id !== id) }))
    setSelectedPartId((sel) => (sel === id ? null : sel))
  }

  const duplicatePart = (id: string) => {
    const source = current?.build.parts.find((part) => part.id === id)
    if (!source) return
    const copy: PartInstance = {
      ...source,
      id: crypto.randomUUID(),
      position: [source.position[0], source.position[1] + 0.15, source.position[2]],
    }
    updateBuild((b) => ({ ...b, parts: [...b.parts, copy] }))
    setSelectedPartId(copy.id)
  }

  /** Click on the body in "Place on body" mode; snaps to the center line when close to it. */
  const placeSelected = (point: Vec3) => {
    if (selectedPartId) {
      const x = Math.abs(point[0]) < 0.12 ? 0 : point[0]
      updatePart(selectedPartId, { position: [x, point[1], point[2]] })
    }
    setPickMode(null)
  }

  const toggleHidden = (path: string) =>
    updateBuild((b) => ({
      ...b,
      hidden: b.hidden.includes(path) ? b.hidden.filter((h) => h !== path) : [...b.hidden, path],
    }))

  const selectPart = (id: string | null) => {
    setSelectedPartId(id)
    if (id) setPanelTab('parts')
    setPickMode((m) => (m === 'place' ? null : m))
  }

  // Latest values for the global key handler without re-binding it on every change.
  const partsKeys = useRef({ pickMode, selectedPartId, removePart })
  partsKeys.current = { pickMode, selectedPartId, removePart }

  const onDrop = async (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const files = await filesFromDrop(e.dataTransfer)
    if (files.length) importFiles(files)
  }

  return (
    <div
      className="app"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
      }}
      onDrop={onDrop}
    >
      <aside className="sidebar">
        <header className="brand">
          <span className="brand-mark" aria-hidden>
            ◢
          </span>
          Car Customizer
          <button className="btn-icon settings-btn" onClick={() => setSettingsOpen(true)} aria-label="Settings" title="Settings">
            ⚙
          </button>
        </header>
        <button className="btn btn-primary btn-block" onClick={() => fileInput.current?.click()}>
          Upload model
        </button>
        <p className="hint">.glb · .gltf · .fbx · .obj — or a .zip / folder with textures</p>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])]
            e.target.value = ''
            if (files.length) importFiles(files)
          }}
        />
        <Library models={library} activeId={current?.savedId} usage={usage} onOpen={openSaved} onDelete={remove} />
      </aside>

      <main className="stage">
        <Viewer
          model={current && placement ? { raw: current.raw, placement } : null}
          modelKey={current?.key ?? 'empty'}
          autoRotate={autoRotate}
          showGrid={showGrid}
          cameraMode={cameraMode}
          viewRequest={viewRequest}
          onFocus={focusOrbit}
          showViewCube={settings.showViewCube}
          panelInset={current && cameraMode !== 'fly' && wideStage ? 336 : 0}
          settings={settings}
          onFlySpeedChange={setFlySpeed}
          onViewDirection={requestDirection}
          hudRef={hudRef}
          parts={{
            build: current?.build ?? EMPTY_BUILD,
            meshIndex,
            selectedId: selectedPartId,
            gizmoMode,
            pickMode,
            apiRef: sceneApiRef,
            onSelect: selectPart,
            onTransform: updatePart,
            onPlace: placeSelected,
            onToggleHidden: toggleHidden,
          }}
          captureRef={captureRef}
        />

        {pickMode && (
          <div className="pick-banner" role="status">
            {pickMode === 'place' ? 'Click a spot on the car to move the part there' : 'Click parts of the car to hide them'}
            <span>
              <kbd>Esc</kbd> {pickMode === 'place' ? 'cancel' : 'done'}
            </span>
          </div>
        )}

        {current && settings.showMinimap && <Minimap hudRef={hudRef} onMoveTo={moveCameraTo} />}
        {current && cameraMode === 'fly' && <FlyHud hudRef={hudRef} settings={settings} />}

        {current && (
          <ViewToolbar
            mode={cameraMode}
            lookMode={settings.lookMode}
            showHints={settings.showHints}
            onMode={changeCameraMode}
            onView={requestView}
          />
        )}

        {!current && !busy && (
          <button className="empty" onClick={() => fileInput.current?.click()}>
            <strong>Drop a 3D car model here</strong>
            <span>or click to browse — GLB recommended</span>
          </button>
        )}

        {/* Free cam is immersive: settings hide (like a game HUD) and return on Esc. */}
        {current && placement && stats && cameraMode !== 'fly' && (
          <ModelPanel
            model={current}
            dimensions={placement.dimensions}
            stats={stats}
            toggles={[
              { label: 'Turntable', checked: autoRotate, onChange: setAutoRotate },
              { label: 'Grid', checked: showGrid, onChange: setShowGrid },
              {
                label: 'Minimap',
                checked: settings.showMinimap,
                onChange: (v) => updateSettings({ showMinimap: v }),
                hint: 'Top-down map (M)',
              },
              { label: 'View cube', checked: settings.showViewCube, onChange: (v) => updateSettings({ showViewCube: v }) },
            ]}
            onChange={update}
            onAutoOrient={() => update({ transform: { ...current.transform, rotation: autoOrient(current.bounds) } })}
            onSave={save}
            saving={!!busy}
            tab={panelTab}
            onTab={setPanelTab}
            partsCount={current.build.parts.length}
            partsPanel={
              <PartsPanel
                build={current.build}
                meshIndex={meshIndex}
                selectedId={selectedPartId}
                gizmoMode={gizmoMode}
                pickMode={pickMode}
                onAdd={addPart}
                onSelect={selectPart}
                onUpdate={updatePart}
                onRemove={removePart}
                onDuplicate={duplicatePart}
                onGizmoMode={setGizmoMode}
                onPickMode={setPickMode}
                onToggleHidden={toggleHidden}
                onShowAll={() => updateBuild((b) => ({ ...b, hidden: [] }))}
              />
            }
          />
        )}

        {busy && (
          <div className="overlay">
            <div className="spinner" />
            {busy}
          </div>
        )}
        {error && (
          <div className="toast" role="alert">
            {error}
            <button className="btn-icon" onClick={() => setError(null)} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}
        {dragging && <div className="drop-hint">Drop to load model</div>}
      </main>

      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        onChange={updateSettings}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  )
}
