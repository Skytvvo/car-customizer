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
import HistoryPanel from './components/HistoryPanel'
import type { GizmoMode, PickMode, SceneApi } from './components/PartsLayer'
import type { PanelTab } from './components/ModelPanel'
import { emptyBuild, indexMeshes, meshLabel, type Build, type PartInstance, type Vec3 } from './lib/build'
import { useHistory, type EditDoc } from './lib/history'
import { CATALOG, partName, resolveParams } from './parts/catalog'
import { forgetPartTemplate, importPartAsset, initialFit } from './parts/uploaded'
import { deletePartAsset, listPartAssets, savePartAsset } from './lib/storage'
import type { ModelRecord, PartAsset, StoredFile } from './lib/types'

const DEFAULT_LENGTH = 4.5
const EMPTY_BUILD = emptyBuild()

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number'])
/** Fields with their own text undo, where Ctrl+Z must not undo app edits. */
function isTextField(el: HTMLElement | null) {
  if (!el) return false
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true
  return el.tagName === 'INPUT' && TEXT_INPUT_TYPES.has((el as HTMLInputElement).type)
}

/** The model currently open in the viewer. What the user edits lives in the history document (EditDoc). */
export interface OpenModel {
  key: string
  savedId?: string
  createdAt?: number
  format: string
  mainFile: string
  files: StoredFile[]
  raw: THREE.Object3D
  bounds: THREE.Box3
  missing: string[]
  dispose: () => void
}

/** What the side panel shows: the model plus its current edits. */
export type ModelView = OpenModel & EditDoc & { dirty: boolean }

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
  const [assets, setAssets] = useState<PartAsset[]>([])
  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets])
  const history = useHistory()
  const doc = history.doc
  // The document as last saved; undoing back to it makes the car "Saved" again.
  const [savedDoc, setSavedDoc] = useState<EditDoc | null>(null)
  const dirty = !!current && (!current.savedId || doc !== savedDoc)
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
    listPartAssets()
      .then(setAssets)
      .catch((e) => setError(String(e)))
  }, [refreshLibrary])

  useEffect(() => saveSettings(settings), [settings])
  const updateSettings = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), [])
  const setFlySpeed = useCallback((flySpeed: number) => updateSettings({ flySpeed }), [updateSettings])

  const placement = useMemo(
    () => (current && doc ? computePlacement(current.bounds, doc.transform) : null),
    [current?.bounds, doc?.transform], // eslint-disable-line react-hooks/exhaustive-deps
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
      const target = e.target as HTMLElement | null
      // Undo/redo works everywhere except text fields (they keep their own text undo) and dialogs.
      if ((e.metaKey || e.ctrlKey) && (e.code === 'KeyZ' || e.code === 'KeyY')) {
        if (isTextField(target) || target?.closest?.('dialog')) return
        e.preventDefault()
        if (e.code === 'KeyY' || e.shiftKey) partsKeys.current.history.redo()
        else partsKeys.current.history.undo()
        return
      }
      const typing = target?.closest?.('input, textarea, select, [contenteditable], dialog')
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

  const open = (next: OpenModel, initial: EditDoc, label: string) => {
    setCameraMode('orbit')
    setSelectedPartId(null)
    setPickMode(null)
    history.reset(initial, label)
    setSavedDoc(next.savedId ? initial : null)
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
      const name = main.name.split('/').pop()!.replace(/\.[^.]+$/, '')
      open(
        {
          key: crypto.randomUUID(),
          format: extOf(main.name),
          mainFile: main.name,
          files,
          raw: loaded.object,
          bounds,
          missing: loaded.missing,
          dispose: loaded.dispose,
        },
        { name, transform: { rotation: autoOrient(bounds), targetLength: DEFAULT_LENGTH }, build: emptyBuild() },
        `Imported ${name}`,
      )
    })

  const openSaved = (record: ModelRecord) =>
    run(`Opening ${record.name}…`, async () => {
      const files = await getModelFiles(record.id)
      const loaded = await loadModel(files, record.mainFile)
      open(
        {
          key: record.id,
          savedId: record.id,
          createdAt: record.createdAt,
          format: record.format,
          mainFile: record.mainFile,
          files,
          raw: loaded.object,
          bounds: measureBounds(loaded.object),
          missing: loaded.missing,
          dispose: loaded.dispose,
        },
        { name: record.name, transform: record.transform, build: record.build ?? emptyBuild() },
        'Opened',
      )
    })

  const save = () =>
    current &&
    doc &&
    placement &&
    stats &&
    run('Saving…', async () => {
      const now = Date.now()
      const id = current.savedId ?? crypto.randomUUID()
      const record: ModelRecord = {
        id,
        name: doc.name.trim() || 'Untitled car',
        format: current.format,
        mainFile: current.mainFile,
        transform: doc.transform,
        stats: {
          ...stats,
          sizeBytes: current.files.reduce((sum, f) => sum + f.blob.size, 0),
          dimensions: placement.dimensions,
        },
        build: doc.build,
        thumbnail: captureRef.current?.(),
        createdAt: current.createdAt ?? now,
        updatedAt: now,
      }
      // Original files are immutable, so they're written only on the first save.
      await saveModel(record, current.savedId ? undefined : current.files)
      setCurrent((c) => (c ? { ...c, savedId: id, createdAt: record.createdAt } : c))
      setSavedDoc(doc)
      await refreshLibrary()
    })

  const remove = (record: ModelRecord) => {
    if (!confirm(`Delete "${record.name}" from your library? This can't be undone.`)) return
    run('Deleting…', async () => {
      await deleteModel(record.id)
      if (current?.savedId === record.id) {
        current.dispose()
        setCurrent(null)
        history.clear()
      }
      await refreshLibrary()
    })
  }

  // ── Editing: every change goes through the history so it can be undone ──
  const edit = history.commit
  const update = (patch: Partial<Pick<EditDoc, 'name' | 'transform'>>) => {
    if (!doc) return
    if (patch.name !== undefined) return edit('Renamed car', (d) => ({ ...d, name: patch.name! }), 'name')
    const t = patch.transform!
    const label = t.targetLength !== doc.transform.targetLength ? `Length ${t.targetLength} m` : 'Changed orientation'
    edit(label, (d) => ({ ...d, transform: t }))
  }

  const updateBuild = (label: string, fn: (build: Build) => Build, key?: string) =>
    edit(label, (d) => ({ ...d, build: fn(d.build) }), key)
  const updatePart = (id: string, patch: Partial<PartInstance>, label: string, key?: string) =>
    updateBuild(label, (b) => ({ ...b, parts: b.parts.map((part) => (part.id === id ? { ...part, ...patch } : part)) }), key)
  const nameOf = (id: string) => {
    const part = doc?.build.parts.find((x) => x.id === id)
    return part ? partName(part, assets) : 'part'
  }

  const insertPart = (part: PartInstance, label: string) => {
    updateBuild(label, (b) => ({ ...b, parts: [...b.parts, part] }))
    setSelectedPartId(part.id)
    setGizmoMode('translate')
    setPanelTab('parts')
  }

  const addPart = (kind: string, presetId?: string) => {
    const def = CATALOG[kind]
    if (!def || !placement) return
    const dims = placement.dimensions
    const preset = def.presets.find((p) => p.id === presetId) ?? def.presets[0]
    const position = def.place(dims, sceneApiRef.current)
    const part: PartInstance = {
      id: crypto.randomUUID(),
      kind,
      preset: preset?.id,
      params: resolveParams(def, dims, preset),
      position,
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      finish: { ...(preset?.finish ?? def.defaultFinish) },
    }
    insertPart(part, `Added ${def.name}${preset ? ` · ${preset.name}` : ''}`)
    // Swing the camera to a low 3/4 view of the end of the car where the part landed.
    const low = position[1] < dims[1] * 0.4
    moveCamera({ dir: [0.95, low ? 0.25 : 0.5, position[2] < 0 ? -1.05 : 1.05] })
  }

  /** Restyle a part from a preset; position, rotation and size stay. */
  const applyPreset = (id: string, presetId: string) => {
    const part = doc?.build.parts.find((x) => x.id === id)
    const def = part && CATALOG[part.kind]
    const preset = def?.presets.find((p) => p.id === presetId)
    if (!part || !def || !preset || !placement) return
    updatePart(
      id,
      { preset: preset.id, params: resolveParams(def, placement.dimensions, preset), finish: preset.finish ?? part.finish },
      `Style: ${def.name} · ${preset.name}`,
    )
  }

  /** Put an uploaded part on the roof center at a sensible size, then let the user click where it goes. */
  const addAssetPart = (asset: PartAsset) => {
    if (!placement) return
    const h = placement.dimensions[1]
    const fit = initialFit(asset, placement.dimensions)
    insertPart(
      {
        id: crypto.randomUUID(),
        kind: 'upload',
        assetId: asset.id,
        params: { fit },
        position: [0, sceneApiRef.current?.surfaceBelow(0, 0) ?? h, 0],
        rotation: [0, 0, 0],
        scale: [fit, fit, fit],
        finish: { type: 'original', color: '#111214' },
      },
      `Added ${asset.name}`,
    )
    setPickMode('place')
  }

  const uploadParts = (files: File[]) =>
    run('Importing part…', async () => {
      const asset = await importPartAsset(files)
      await savePartAsset(asset)
      setAssets((list) => [asset, ...list])
      addAssetPart(asset)
    })

  const deleteAsset = (asset: PartAsset) => {
    if (!confirm(`Delete "${asset.name}" from your parts library? Cars using it will show it as missing.`)) return
    run('Deleting part…', async () => {
      await deletePartAsset(asset.id)
      forgetPartTemplate(asset.id)
      setAssets((list) => list.filter((a) => a.id !== asset.id))
    })
  }

  const removePart = (id: string) => {
    updateBuild(`Removed ${nameOf(id)}`, (b) => ({ ...b, parts: b.parts.filter((part) => part.id !== id) }))
    setSelectedPartId((sel) => (sel === id ? null : sel))
  }

  const duplicatePart = (id: string) => {
    const source = doc?.build.parts.find((part) => part.id === id)
    if (!source) return
    insertPart(
      { ...source, id: crypto.randomUUID(), position: [source.position[0], source.position[1] + 0.15, source.position[2]] },
      `Duplicated ${nameOf(id)}`,
    )
  }

  const transformPart = (id: string, patch: Pick<PartInstance, 'position' | 'rotation' | 'scale'>) => {
    const verb = gizmoMode === 'translate' ? 'Moved' : gizmoMode === 'rotate' ? 'Rotated' : 'Resized'
    updatePart(id, patch, `${verb} ${nameOf(id)}`)
  }

  /** Click on the body in "Place on body" mode; snaps to the center line when close to it. */
  const placeSelected = (point: Vec3) => {
    if (selectedPartId) {
      const x = Math.abs(point[0]) < 0.12 ? 0 : point[0]
      updatePart(selectedPartId, { position: [x, point[1], point[2]] }, `Placed ${nameOf(selectedPartId)}`)
    }
    setPickMode(null)
  }

  const toggleHidden = (path: string) => {
    const hidden = doc?.build.hidden.includes(path)
    const label = `${hidden ? 'Showed' : 'Hid'} ${meshLabel(meshIndex?.byPath.get(path), path)}`
    updateBuild(label, (b) => ({
      ...b,
      hidden: b.hidden.includes(path) ? b.hidden.filter((h) => h !== path) : [...b.hidden, path],
    }))
  }

  const selectPart = (id: string | null) => {
    setSelectedPartId(id)
    if (id) setPanelTab('parts')
    setPickMode((m) => (m === 'place' ? null : m))
  }

  // Undo can remove the selected part; drop the selection then.
  useEffect(() => {
    if (selectedPartId && doc && !doc.build.parts.some((p) => p.id === selectedPartId)) setSelectedPartId(null)
  }, [doc, selectedPartId])

  // Latest values for the global key handler without re-binding it on every change.
  const partsKeys = useRef({ pickMode, selectedPartId, removePart, history })
  partsKeys.current = { pickMode, selectedPartId, removePart, history }

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
            build: doc?.build ?? EMPTY_BUILD,
            assets: assetMap,
            meshIndex,
            selectedId: selectedPartId,
            gizmoMode,
            pickMode,
            apiRef: sceneApiRef,
            onSelect: selectPart,
            onTransform: transformPart,
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
        {current && doc && placement && stats && cameraMode !== 'fly' && (
          <ModelPanel
            model={{ ...current, ...doc, dirty }}
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
            onAutoOrient={() => update({ transform: { ...doc.transform, rotation: autoOrient(current.bounds) } })}
            onSave={save}
            saving={!!busy}
            tab={panelTab}
            onTab={setPanelTab}
            partsCount={doc.build.parts.length}
            history={history}
            historyPanel={<HistoryPanel history={history} />}
            partsPanel={
              <PartsPanel
                build={doc.build}
                assets={assets}
                meshIndex={meshIndex}
                selectedId={selectedPartId}
                gizmoMode={gizmoMode}
                pickMode={pickMode}
                onAdd={addPart}
                onAddAsset={(id) => assetMap.get(id) && addAssetPart(assetMap.get(id)!)}
                onUploadParts={uploadParts}
                onDeleteAsset={deleteAsset}
                onApplyPreset={applyPreset}
                onSelect={selectPart}
                onUpdate={updatePart}
                onRemove={removePart}
                onDuplicate={duplicatePart}
                onGizmoMode={setGizmoMode}
                onPickMode={setPickMode}
                onToggleHidden={toggleHidden}
                onShowAll={() => updateBuild('Showed all original parts', (b) => ({ ...b, hidden: [] }))}
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
