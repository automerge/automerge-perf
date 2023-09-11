const fs = require('fs')
const Automerge = require('../../automerge/src/automerge')
const { splitContainers } = require('../../automerge/backend/columnar')

// Run node with argument --expose-gc to enable this
global.gc()
const memBefore = process.memoryUsage().heapUsed

const changes = splitContainers(fs.readFileSync('text-edits.amrg'))
//let [state, patch] = Automerge.applyChanges(Automerge.init(), changes)
let backend = Automerge.Backend.loadChanges(Automerge.Backend.init(), changes)

global.gc()
const memAfter = process.memoryUsage().heapUsed
console.log(`Memory used: ${((memAfter - memBefore) / 1024 / 1024).toFixed(2)} MB`)
//console.log(JSON.stringify(patch, null, 4))
//console.log(state.text.join(''))
