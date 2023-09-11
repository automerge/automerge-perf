const Automerge = require('../../automerge/src/automerge')
const fs = require('fs')
const doc = Automerge.load(new Uint8Array(fs.readFileSync('paper.doc.crdt')))
console.log(doc.text.toString())

/*
* debugging misplaced hyphen in "left-hand side"
hyphen is inserted by 219344@b31cc in seq 3951
219344@b31cc is deleted by 219786@b31cc in seq 4393
b31cc's seqs go up to 7935

[...docState.blocks[seekToOp(docState, {objActor: '9654bd415cfac9ee6aa9f55bf1024f840afdbb1f37237673c928491a91ff7783', objActorNum: 0, objCtr: 1, keyActor: 'b31cc199c54585ad73bc199bbbfd3dfaef91d0ccf43a449dbd55927bc265b758', keyCtr: 219344, keyStr: null}).blockIndex].columns[10].decoder.buf].map(c=>String.fromCharCode(c)).join('').match(/(.{40})/g)

  {
    elemId: '219340@b31cc199c54585ad73bc199bbbfd3dfaef91d0ccf43a449dbd55927bc265b758',
    pred: [
      '219340@b31cc199c54585ad73bc199bbbfd3dfaef91d0ccf43a449dbd55927bc265b758'
    ],
    value: 'l'
  },
  {
    elemId: '219341@b31cc199c54585ad73bc199bbbfd3dfaef91d0ccf43a449dbd55927bc265b758',
    pred: [
      '219341@b31cc199c54585ad73bc199bbbfd3dfaef91d0ccf43a449dbd55927bc265b758'
    ],
    value: 'e'
  },
  {
    elemId: '219342@b31cc199c54585ad73bc199bbbfd3dfaef91d0ccf43a449dbd55927bc265b758',
    pred: [
      '219342@b31cc199c54585ad73bc199bbbfd3dfaef91d0ccf43a449dbd55927bc265b758'
    ],
    value: 'f'
  },
  {
    elemId: '219343@b31cc199c54585ad73bc199bbbfd3dfaef91d0ccf43a449dbd55927bc265b758',
    pred: [
      '219343@b31cc199c54585ad73bc199bbbfd3dfaef91d0ccf43a449dbd55927bc265b758'
    ],
    value: 't'
  },
  {
    elemId: '219345@b31cc199c54585ad73bc199bbbfd3dfaef91d0ccf43a449dbd55927bc265b758',
    pred: [
      '219345@b31cc199c54585ad73bc199bbbfd3dfaef91d0ccf43a449dbd55927bc265b758'
    ],
    value: 'h'
  },
  {
    elemId: '219346@b31cc199c54585ad73bc199bbbfd3dfaef91d0ccf43a449dbd55927bc265b758',
    pred: [
      '219346@b31cc199c54585ad73bc199bbbfd3dfaef91d0ccf43a449dbd55927bc265b758'
    ],
    value: 'a'
  },
  {
    elemId: '219347@b31cc199c54585ad73bc199bbbfd3dfaef91d0ccf43a449dbd55927bc265b758',
    pred: [
      '219347@b31cc199c54585ad73bc199bbbfd3dfaef91d0ccf43a449dbd55927bc265b758'
    ],
    value: 'n'
  },
  {
    elemId: '219348@b31cc199c54585ad73bc199bbbfd3dfaef91d0ccf43a449dbd55927bc265b758',
    pred: [
      '219348@b31cc199c54585ad73bc199bbbfd3dfaef91d0ccf43a449dbd55927bc265b758'
    ],
    value: 'd'
  },
*/
