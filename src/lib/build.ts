import * as THREE from 'three'

export type Vec3 = [number, number, number]

export type FinishType = 'gloss' | 'metallic' | 'satin' | 'matte' | 'carbon' | 'chrome'

export interface Finish {
  type: FinishType
  color: string
}

export type PartParams = Record<string, number | boolean>

/** An add-on part placed on the car. Positions are in the normalized car space (meters, car centered, ground at y = 0). */
export interface PartInstance {
  id: string
  /** Built-in generator, e.g. 'gt-wing'. */
  kind: string
  params: PartParams
  position: Vec3
  rotation: Vec3
  scale: Vec3
  finish: Finish
}

/**
 * Customization stored next to the model, never baked into it: the original file stays
 * untouched, so any change can be undone or reset.
 */
export interface Build {
  parts: PartInstance[]
  /** Original meshes the user hid, by mesh path (see indexMeshes). */
  hidden: string[]
}

export const emptyBuild = (): Build => ({ parts: [], hidden: [] })

export interface MeshIndex {
  byPath: Map<string, THREE.Mesh>
  pathOf: Map<THREE.Object3D, string>
}

/**
 * Gives every mesh a stable id: its child-index path from the model root ("0.3.1").
 * Loading the same file always produces the same hierarchy, so ids survive reloads.
 */
export function indexMeshes(root: THREE.Object3D): MeshIndex {
  const byPath = new Map<string, THREE.Mesh>()
  const pathOf = new Map<THREE.Object3D, string>()
  const walk = (obj: THREE.Object3D, path: string) => {
    if ((obj as THREE.Mesh).isMesh) {
      byPath.set(path, obj as THREE.Mesh)
      pathOf.set(obj, path)
    }
    obj.children.forEach((child, i) => walk(child, path ? `${path}.${i}` : String(i)))
  }
  walk(root, '')
  return { byPath, pathOf }
}

/** Readable label for a mesh: its own name, its material's name, or the path. */
export function meshLabel(mesh: THREE.Mesh | undefined, path: string) {
  if (!mesh) return path
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
  return mesh.name || material?.name || `Mesh ${path}`
}

/** Raycasts hit hidden meshes too; skip anything that isn't actually shown. */
export function isShown(obj: THREE.Object3D | null) {
  for (let o = obj; o; o = o.parent) if (!o.visible) return false
  return true
}

export function firstShownHit(raycaster: THREE.Raycaster, target: THREE.Object3D) {
  return raycaster.intersectObject(target, true).find((hit) => isShown(hit.object))
}
