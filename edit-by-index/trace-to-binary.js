const fs = require('fs')
const { edits, finalText } = require('./editing-trace')
const Automerge = require('../../automerge/src/automerge')

let state = Automerge.from({text: new Automerge.Text()})
const file = fs.openSync('text-edits.amrg', 'w')
fs.writeSync(file, Automerge.getLastLocalChange(state))

for (let i = 0; i < edits.length; i++) {
  if (i % 1000 === 0) console.log(`Processed ${i} edits`)
  state = Automerge.change(state, doc => {
    if (edits[i][1] > 0) doc.text.deleteAt(edits[i][0], edits[i][1])
    if (edits[i].length > 2) doc.text.insertAt(edits[i][0], ...edits[i].slice(2))
  })
  fs.writeSync(file, Automerge.getLastLocalChange(state))
}
fs.closeSync(file)

fs.writeFileSync('text-doc.amrg', Automerge.save(state))

if (state.text.join('') !== finalText) {
  console.log('Mismatched finalText:')
  console.log(state.text.join(''))
}
