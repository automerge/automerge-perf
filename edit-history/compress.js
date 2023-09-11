// To make a condensed-down version of the JSON:
// cat paper.json.gz | gunzip | tail -n +2 | jq -c 'if .ops[0].insert then {action: "insert", actor: .actor, seq: .seq, deps: .deps, time: .time, id: ((.startOp | tostring) + "@" + .actor), char: .ops[0].value, pos: .ops[0].elemId} else {action: "delete", actor: .actor, seq: .seq, deps: .deps, time: .time, pos: .ops[0].elemId} end'


const Automerge = require('../../automerge/src/automerge')
const { edits, finalText } = require('../edit-by-index/editing-trace')
const fs = require('fs')
const zlib = require('zlib')
const readline = require('readline')

let totalLength = 0
const input = fs.createReadStream('paper.json.gz').pipe(zlib.createGunzip())
const lineReader = readline.createInterface({ input })
const output = fs.createWriteStream('paper.changes.crdt')
const changes = []
let hashes = {}
let opsCount = {insert: 0, delete: 0, other: 0}

lineReader.on('line', (line) => {
  const json = JSON.parse(line)

  // Compute hash dependencies
  let deps = []
  if (!hashes[json.actor]) hashes[json.actor] = []
  if (json.seq !== hashes[json.actor].length + 1) {
    throw new RangeError(`Unexpected seq ${json.seq} for actor ${json.actor}`)
  }
  if (json.seq > 1) deps.push(hashes[json.actor][json.seq - 2])
  for (let [depActor, depSeq] of Object.entries(json.deps)) {
    if (depSeq > 0) deps.push(hashes[depActor][depSeq - 1])
  }
  json.deps = deps

  // Operation stats
  for (let op of json.ops) {
    if (op.insert) opsCount.insert += 1;
    else if (op.action === 'del') opsCount.delete += 1;
    else opsCount.other += 1
  }

  const encoded = Automerge.encodeChange(json)
  output.write(encoded)
  totalLength += encoded.byteLength
  changes.push(encoded)

  const decoded = Automerge.decodeChange(encoded)
  hashes[json.actor].push(decoded.hash)
})

lineReader.on('close', () => {
  output.end()
  console.log(`as ${changes.length} individual changes: ${totalLength} bytes`)
  console.log(JSON.stringify(opsCount))

  const [doc] = Automerge.applyChanges(Automerge.init(), changes)
  const compressed = Automerge.save(doc)
  console.log(`as document: ${compressed.byteLength} bytes`)
  fs.writeFileSync('paper.doc.crdt', compressed)

  console.log('decoding document again...')
  const reloaded = Automerge.load(compressed)
  fs.writeFileSync('paper.reconstructed', reloaded.text.toString())
  //if (reloaded.text.toString() !== finalText) throw new RangeError('document reconstruction failed')
  //console.log(`successfully reconstructed document`)
})
