/** Rotation in quarter turns (0–3) around X, Y, Z. */
export type QuarterTurns = [number, number, number]

export interface ModelTransform {
  rotation: QuarterTurns
  /** Real-world car length in meters; the model is scaled so its longest horizontal side matches. */
  targetLength: number
}

export interface ModelStats {
  meshes: number
  triangles: number
  sizeBytes: number
  /** Width (X), height (Y), length (Z) in meters after normalization. */
  dimensions: [number, number, number]
}

export interface StoredFile {
  name: string
  type: string
  blob: Blob
}

/** Library metadata. Original files are kept in a separate store so listing stays fast. */
export interface ModelRecord {
  id: string
  name: string
  format: string
  mainFile: string
  transform: ModelTransform
  stats: ModelStats
  thumbnail?: string
  createdAt: number
  updatedAt: number
}
