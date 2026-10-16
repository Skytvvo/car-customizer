// Copies Draco / Basis (KTX2) decoders from three into public/ so compressed glTF works offline.
import { cpSync, mkdirSync } from 'node:fs'

const src = 'node_modules/three/examples/jsm/libs'
mkdirSync('public/decoders', { recursive: true })
cpSync(`${src}/draco/gltf`, 'public/decoders/draco', { recursive: true })
cpSync(`${src}/basis`, 'public/decoders/basis', { recursive: true })
console.log('decoders copied to public/decoders')
