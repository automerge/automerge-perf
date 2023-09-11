const Backend = require('../../automerge-rs/automerge-backend-wasm/build/cjs')
const fs = require('fs')
const { splitContainers } = require('../../automerge/backend/columnar')

const changes = splitContainers(fs.readFileSync('text-edits.amrg'))
const [backend, patch] = Backend.applyChanges(Backend.init(), changes)
//console.log(JSON.stringify(patch, null, 4))
