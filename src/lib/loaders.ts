import * as THREE from 'three'
import JSZip from 'jszip'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import type { StoredFile } from './types'

/** Entry-point formats in priority order. Everything else (.bin, textures, .mtl) is a resource. */
const MAIN_FORMATS = ['glb', 'gltf', 'fbx', 'obj']

export const ACCEPT = '.glb,.gltf,.fbx,.obj,.mtl,.bin,.zip,.png,.jpg,.jpeg,.webp,.ktx2,.tga,.bmp'

export const extOf = (name: string) => name.split('.').pop()!.toLowerCase()
const baseOf = (url: string) => {
  const clean = url.split(/[?#]/)[0]
  let decoded = clean
  try {
    decoded = decodeURIComponent(clean)
  } catch {
    // keep the raw name
  }
  return decoded.split(/[\\/]/).pop()!.toLowerCase()
}

let renderer: THREE.WebGLRenderer | null = null
let ktx2: KTX2Loader | null = null
let draco: DRACOLoader | null = null

/** KTX2 support detection needs the live renderer. */
export function setRenderer(r: THREE.WebGLRenderer) {
  renderer = r
}

function gltfLoader(manager: THREE.LoadingManager) {
  const loader = new GLTFLoader(manager)
  draco ??= new DRACOLoader().setDecoderPath('/decoders/draco/')
  loader.setDRACOLoader(draco)
  if (renderer) {
    ktx2 ??= new KTX2Loader().setTranscoderPath('/decoders/basis/').detectSupport(renderer)
    loader.setKTX2Loader(ktx2)
  }
  loader.setMeshoptDecoder(MeshoptDecoder)
  return loader
}

const isJunk = (path: string) => path.includes('__MACOSX/') || baseOf(path).startsWith('.')

/** Turns dropped/picked files into StoredFiles, unpacking any .zip archives. */
export async function expandFiles(input: File[]): Promise<StoredFile[]> {
  const out: StoredFile[] = []
  for (const file of input) {
    if (isJunk(file.name)) continue
    if (extOf(file.name) !== 'zip') {
      out.push({ name: file.name, type: file.type, blob: file })
      continue
    }
    const zip = await JSZip.loadAsync(file)
    for (const entry of Object.values(zip.files)) {
      if (entry.dir || isJunk(entry.name)) continue
      out.push({ name: entry.name, type: '', blob: await entry.async('blob') })
    }
  }
  return out
}

/** Picks the file to load: best format first, largest file when there are several. */
export function pickMainFile(files: StoredFile[]): StoredFile {
  for (const format of MAIN_FORMATS) {
    const candidates = files.filter((f) => extOf(f.name) === format)
    if (candidates.length) return candidates.sort((a, b) => b.blob.size - a.blob.size)[0]
  }
  throw new Error('No 3D model found. Supported: .glb, .gltf, .fbx, .obj (or a .zip containing one).')
}

export interface LoadedModel {
  object: THREE.Object3D
  /** Resources the model referenced but that were not uploaded (usually textures). */
  missing: string[]
  dispose: () => void
}

export async function loadModel(files: StoredFile[], mainName: string): Promise<LoadedModel> {
  const main = files.find((f) => f.name === mainName)
  if (!main) throw new Error(`File ${mainName} not found`)

  // Resolve every resource request by file name, wherever the model thinks it lives.
  const urls = new Map<string, string>()
  for (const f of files) urls.set(baseOf(f.name), URL.createObjectURL(f.blob))
  const missing = new Set<string>()
  let pending = 0
  let allLoaded: () => void = () => {}
  const manager = new THREE.LoadingManager(() => allLoaded())
  const { itemStart, itemEnd, itemError } = manager
  manager.itemStart = (url) => (pending++, itemStart(url))
  manager.itemEnd = (url) => (pending--, itemEnd(url))
  manager.itemError = (url) => (missing.add(baseOf(url)), itemError(url))
  manager.setURLModifier((url) => {
    if (url.startsWith('blob:') || url.startsWith('data:')) return url
    const hit = urls.get(baseOf(url))
    if (hit) return hit
    missing.add(baseOf(url))
    return url
  })

  const format = extOf(main.name)
  let object: THREE.Object3D

  if (format === 'glb' || format === 'gltf') {
    const buffer = await main.blob.arrayBuffer()
    const gltf = await gltfLoader(manager).parseAsync(buffer, '')
    object = gltf.scene
  } else if (format === 'fbx') {
    const buffer = await main.blob.arrayBuffer()
    object = new FBXLoader(manager).parse(buffer, '')
  } else if (format === 'obj') {
    const loader = new OBJLoader(manager)
    const mtl = files.find((f) => extOf(f.name) === 'mtl')
    if (mtl) {
      const materials = new MTLLoader(manager).parse(await mtl.blob.text(), '')
      materials.preload()
      loader.setMaterials(materials)
    }
    object = loader.parse(await main.blob.text())
  } else {
    throw new Error(`Unsupported format .${format}`)
  }

  // Wait for textures that loaders fetch after parsing (FBX/OBJ).
  if (pending > 0) {
    await new Promise<void>((resolve) => {
      allLoaded = resolve
      setTimeout(resolve, 20000)
    })
  }

  return {
    object,
    missing: [...missing],
    dispose: () => {
      disposeObject(object)
      urls.forEach((u) => URL.revokeObjectURL(u))
    },
  }
}

export function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.geometry?.dispose()
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const m of materials) {
      if (!m) continue
      for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose()
      m.dispose()
    }
  })
}

export function countGeometry(object: THREE.Object3D) {
  let meshes = 0
  let triangles = 0
  object.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    meshes++
    const g = mesh.geometry
    triangles += (g.index ? g.index.count : (g.attributes.position?.count ?? 0)) / 3
  })
  return { meshes, triangles: Math.round(triangles) }
}
