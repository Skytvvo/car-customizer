// Reads files from a drop event, including whole folders (a .gltf next to a textures/ folder is common).

function readEntry(entry: FileSystemEntry, path: string): Promise<File[]> {
  if (entry.isFile) {
    return new Promise((resolve, reject) =>
      (entry as FileSystemFileEntry).file(
        (file) => resolve([new File([file], path + file.name, { type: file.type })]),
        reject,
      ),
    )
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader()
  return new Promise((resolve, reject) => {
    const all: Promise<File[]>[] = []
    const readBatch = () =>
      reader.readEntries((entries) => {
        if (!entries.length) return Promise.all(all).then((lists) => resolve(lists.flat()), reject)
        for (const child of entries) all.push(readEntry(child, `${path}${entry.name}/`))
        readBatch() // readEntries returns results in batches
      }, reject)
    readBatch()
  })
}

export async function filesFromDrop(data: DataTransfer): Promise<File[]> {
  const entries = [...data.items]
    .map((item) => item.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => !!e)
  if (!entries.length) return [...data.files]
  return (await Promise.all(entries.map((e) => readEntry(e, '')))).flat()
}
