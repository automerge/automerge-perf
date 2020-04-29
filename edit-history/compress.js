const { encodeChange, decodeChange, encodeDocument } = require('../../automerge/backend/columnar')
const fs = require('fs')
const zlib = require('zlib')
const readline = require('readline')

let totalLength = 0
const input = fs.createReadStream('paper.json.gz').pipe(zlib.createGunzip())
const lineReader = readline.createInterface({ input })
const output = fs.createWriteStream('paper.changes.crdt')
const changes = []
let hashes = {}

lineReader.on('line', (line) => {
  const json = JSON.parse(line), deps = []
  if (!hashes[json.actor]) hashes[json.actor] = []
  if (json.seq !== hashes[json.actor].length + 1) {
    throw new RangeError(`Unexpected seq ${json.seq} for actor ${json.actor}`)
  }
  if (json.seq > 1) deps.push(hashes[json.actor][json.seq - 2])
  for (let [depActor, depSeq] of Object.entries(json.deps)) {
    if (depSeq > 0) deps.push(hashes[depActor][depSeq - 1])
  }
  json.deps = deps

  const encoded = encodeChange(json)
  output.write(encoded)
  totalLength += encoded.byteLength
  changes.push(encoded)

  const decoded = decodeChange(encoded)
  hashes[json.actor].push(decoded.hash)
})

lineReader.on('close', () => {
  output.end()
  console.log(`as ${changes.length} individual changes: ${totalLength} bytes`)
  const doc = encodeDocument(changes)
  console.log(`as document: ${doc.byteLength} bytes`)
  fs.writeFileSync('paper.doc.crdt', doc)
})
