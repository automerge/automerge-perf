// Apply the paper editing trace to an Automerge.Text object, one char at a time
const { edits, finalText } = require('./editing-trace')
const Automerge = require('../../automerge/src/automerge')

const start = new Date()
let state = Automerge.from({text: new Automerge.Text()})

for (let i = 0; i < 50000 /*edits.length*/; i++) {
  if (i % 1000 === 0) console.log(`Processed ${i} edits in ${new Date() - start} ms`)
  state = Automerge.change(state, doc => {
    if (edits[i][1] > 0) {
      //console.log(`doc.text.deleteAt(${edits[i][0]}, ${edits[i][1]}) // ${i}`)
      doc.text.deleteAt(edits[i][0], edits[i][1])
    }
    if (edits[i].length > 2) {
      //console.log(`doc.text.insertAt(${edits[i][0]}, ${edits[i].slice(2).map(x => JSON.stringify(x)).join(', ')}) // ${i}`)
      doc.text.insertAt(edits[i][0], ...edits[i].slice(2))
    }
  })
}

//console.log(state.text.join(''))

/*if (state.text.join('') !== finalText) {
  throw new RangeError('ERROR: final text did not match expectation')
}*/
