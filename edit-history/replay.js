const { finalText } = require('../edit-by-index/editing-trace')
const fs = require('fs')
const zlib = require('zlib')
const readline = require('readline')

readFile()

function readFile() {
  const input = fs.createReadStream('paper.json.gz').pipe(zlib.createGunzip())
  const lineReader = readline.createInterface({ input })
  const changes = []

  lineReader.on('line', (line) => {
    changes.push(JSON.parse(line))
  })

  lineReader.on('close', () => {
    process(changes)
  })
}

function process(changes) {
  let stateByActor = {}, dependents = [], transactions = []

  for (let json of changes) {
    for (let actor of Object.keys(json.deps)) {
      dependents.push(`${json.deps[actor]}@${actor}`)
    }
  }

  for (let json of changes) {
    if (!stateByActor[json.actor] && json.seq === 1 || Object.keys(json.deps).length > 0) {
      const state = {txId: transactions.length, actor: json.actor, seq: 0, parents: [], chars: [], patches: [], ops: []}
      transactions.push(state)
      stateByActor[json.actor] = state
    } else if (stateByActor[json.actor] && json.seq !== stateByActor[json.actor].seq + 1) {
      throw `Unexpected sequence number ${json.seq} for actor ${json.actor}`
    }

    let state = stateByActor[json.actor]
    state.seq = json.seq

    if (Object.keys(json.deps).length > 0) {
      for (let actor of Object.keys(json.deps)) {
        const parentId = transactions.findIndex(tx => tx.actor === actor && tx.seq === json.deps[actor])
        state.parents.push(parentId)
      }
    }

    if (state.lastForTxn) {
      const oldState = state
      state = JSON.parse(JSON.stringify(state))
      state.txId = transactions.length
      state.parents = [state.txId]
      state.lastForTxn = false
      transactions.push(state)
      stateByActor[json.actor] = state
    }

    if (dependents.includes(`${json.seq}@${json.actor}`)) state.lastForTxn = true

    let opCounter = json.startOp
    for (let op of json.ops) {
      const opId = `${opCounter}@${json.actor}`

      if (op.insert) {
        //let index = state.chars.findIndex(elem => elem.elemId === op.elemId)
        //if (index < 0 && op.elemId !== '_head') throw `Unknown elemId on insert: ${op.elemId}`
        /* scanning for the right insertion position -- not needed because the dataset has no concurrent insertions at the same positions
        while (index + 1 < state.chars.length) {
          const parsedId = parseOpId(state.chars[index + 1].elemId)
          if (parsedId.counter < opCounter || (parsedId.counter === opCounter && parsedId.actorId < json.actor)) break
        }*/
        //state.chars.splice(index + 1, 0, {elemId: opId, char: op.value, deleted: false})
      } else if (op.action === 'del') {
        //const elem = state.chars.find(elem => elem.elemId === op.elemId)
        //if (!elem) throw `Unknown elemId on delete: ${op.elemId}`
        //elem.deleted = true
      }

      opCounter += 1
    }
  }

  /*
  const text = chars.filter(elem => !elem.deleted).map(elem => elem.char).join('')
  if (text !== finalText) {
    console.log('Mismatch:')
    console.log(text)
  }
  */
  console.log(JSON.stringify(transactions, null, 4))
}

function parseOpId(opId) {
  const match = /^(\d+)@(.*)$/.exec(opId || '')
  if (!match) {
    throw new RangeError(`Not a valid opId: ${opId}`)
  }
  return {counter: parseInt(match[1], 10), actorId: match[2]}
}
