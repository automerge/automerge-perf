const Automerge = require('../../automerge/src/automerge')
const fs = require('fs')
const changes = new Uint8Array(fs.readFileSync('paper.changes.crdt'))
const [doc] = Automerge.applyChanges(Automerge.init(), [changes])
