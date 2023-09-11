const fs = require('fs')
const Automerge = require('../../automerge/src/automerge')
const { finalText } = require('./editing-trace')

//Automerge.setDefaultBackend(require('../../automerge-rs/automerge-backend-wasm/build/cjs'))

// Run node with argument --expose-gc to enable this
global.gc()
const memBefore = process.memoryUsage().heapUsed

const start = new Date()
let doc = Automerge.load(fs.readFileSync('text-doc.amrg'))
//let backend = Automerge.Backend.load(fs.readFileSync('text-doc.amrg'))
console.log(`Loaded document in ${new Date() - start} ms`)

global.gc()
const memAfter = process.memoryUsage().heapUsed
console.log(`Memory used: ${((memAfter - memBefore) / 1024 / 1024).toFixed(2)} MB`)

const startReconstruction = new Date()
Automerge.getAllChanges(doc)
console.log(`Recomputed hash graph in ${new Date() - startReconstruction} ms`)
global.gc()
const memAfterReconstruction = process.memoryUsage().heapUsed
console.log(`Memory used: ${((memAfterReconstruction - memBefore) / 1024 / 1024).toFixed(2)} MB`)

if (doc.text.join('') !== finalText) console.log('Final text does not match: ' + doc.text.join(''))
