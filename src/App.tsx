import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import type * as THREE from 'three'
import Viewer, { type CaptureFn } from './components/Viewer'
import ModelPanel from './components/ModelPanel'
import Library from './components/Library'
import ViewToolbar from './components/ViewToolbar'
import { VIEWS, type CameraMode, type CameraView, type ViewRequest } from './lib/camera'
import { ACCEPT, countGeometry, expandFiles, extOf, loadModel, pickMainFile } from './lib/loaders'
import { autoOrient, computePlacement, measureBounds } from './lib/normalize'
import { deleteModel, getModelFiles, listModels, saveModel, storageUsage } from './lib/storage'
import { filesFromDrop } from './lib/dropFiles'
import type { ModelRecord, ModelTransform, StoredFile } from './lib/types'

const DEFAULT_LENGTH = 4.5

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

  const placement = useMemo(
    () => (current ? computePlacement(current.bounds, current.transform) : null),
    [current?.bounds, current?.transform], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const stats = useMemo(() => (current ? countGeometry(current.raw) : null), [current?.raw]) // eslint-disable-line react-hooks/exhaustive-deps

  // Any deliberate camera move stops the turntable, otherwise it spins away from the chosen view.
  const changeCameraMode = useCallback((mode: CameraMode) => {
    if (mode === 'fly') setAutoRotate(false)
    setCameraMode(mode)
  }, [])
  const requestView = useCallback((view: CameraView) => {
    setAutoRotate(false)
    setCameraMode('orbit')
    setViewRequest((prev) => ({ view, n: (prev?.n ?? 0) + 1 }))
  }, [])
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
      const typing = (e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]')
      if (typing || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      if (e.code === 'KeyF') changeCameraMode(cameraModeRef.current === 'fly' ? 'orbit' : 'fly')
      else if (e.code === 'Escape') setCameraMode('orbit')
      else if (/^Digit[1-9]$/.test(e.code) && views[Number(e.code.slice(5)) - 1]) {
        requestView(views[Number(e.code.slice(5)) - 1])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hasModel, requestView, changeCameraMode])

  const open = (next: OpenModel) => {
    setCameraMode('orbit')
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
        thumbnail: captureRef.current?.(),
        createdAt: current.createdAt ?? now,
        updatedAt: now,
      }
      // Original files are immutable, so they're written only on the first save.
      await saveModel(record, current.savedId ? undefined : current.files)
      setCurrent({ ...current, savedId: id, key: current.key, createdAt: record.createdAt, dirty: false })
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
          captureRef={captureRef}
        />

        {current && <ViewToolbar mode={cameraMode} onMode={changeCameraMode} onView={requestView} />}

        {!current && !busy && (
          <button className="empty" onClick={() => fileInput.current?.click()}>
            <strong>Drop a 3D car model here</strong>
            <span>or click to browse — GLB recommended</span>
          </button>
        )}

        {current && placement && stats && (
          <ModelPanel
            model={current}
            dimensions={placement.dimensions}
            stats={stats}
            autoRotate={autoRotate}
            showGrid={showGrid}
            onAutoRotate={setAutoRotate}
            onShowGrid={setShowGrid}
            onChange={update}
            onAutoOrient={() => update({ transform: { ...current.transform, rotation: autoOrient(current.bounds) } })}
            onSave={save}
            saving={!!busy}
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
    </div>
  )
}
