const assert = require('assert')
const fs = require('fs')
const { Encoder, Decoder } = require('../../automerge/backend/encoding')
const { finalText } = require('../edit-by-index/editing-trace.js')

const { StringDecoder } = require('string_decoder')
const utf8decoder = new StringDecoder('utf8')
utf8ToString = (buffer) => utf8decoder.end(Buffer.from(buffer))

// Experimental hacky fast path implementation of loading the latest text from a
// whole-document binary encoded file.

// Copypasta from encoding.js
const COLUMN_TYPE = {
  GROUP_CARD: 0, ACTOR_ID: 1, INT_RLE: 2, INT_DELTA: 3, BOOLEAN: 4,
  STRING_RLE: 5, VALUE_LEN: 6, VALUE_RAW: 7
}

const CHANGE_COLUMNS = {
  objActor:  0 << 3 | COLUMN_TYPE.ACTOR_ID,
  objCtr:    0 << 3 | COLUMN_TYPE.INT_RLE,
  keyActor:  1 << 3 | COLUMN_TYPE.ACTOR_ID,
  keyCtr:    1 << 3 | COLUMN_TYPE.INT_DELTA,
  keyStr:    1 << 3 | COLUMN_TYPE.STRING_RLE,
  idActor:   2 << 3 | COLUMN_TYPE.ACTOR_ID,
  idCtr:     2 << 3 | COLUMN_TYPE.INT_DELTA,
  insert:    3 << 3 | COLUMN_TYPE.BOOLEAN,
  action:    4 << 3 | COLUMN_TYPE.INT_RLE,
  valLen:    5 << 3 | COLUMN_TYPE.VALUE_LEN,
  valRaw:    5 << 3 | COLUMN_TYPE.VALUE_RAW,
  chldActor: 6 << 3 | COLUMN_TYPE.ACTOR_ID,
  chldCtr:   6 << 3 | COLUMN_TYPE.INT_DELTA,
  predNum:   7 << 3 | COLUMN_TYPE.GROUP_CARD,
  predActor: 7 << 3 | COLUMN_TYPE.ACTOR_ID,
  predCtr:   7 << 3 | COLUMN_TYPE.INT_DELTA,
  succNum:   8 << 3 | COLUMN_TYPE.GROUP_CARD,
  succActor: 8 << 3 | COLUMN_TYPE.ACTOR_ID,
  succCtr:   8 << 3 | COLUMN_TYPE.INT_DELTA
}

function readColumns(decoder, numColumns) {
  if (numColumns === undefined) numColumns = Number.MAX_SAFE_INTEGER
  let lastColumnId = -1, columns = []
  while (!decoder.done && columns.length < numColumns) {
    const columnId = decoder.readUint32()
    const buffer = decoder.readPrefixedBytes()
    if (columnId <= lastColumnId) throw new RangeError('Columns must be in ascending order')
    lastColumnId = columnId
    columns.push({columnId, decoder: new Decoder(buffer)})
  }
  return columns
}

function readRLE(decoder) {
  let count = decoder.readInt53()
  if (count > 0) {
    return [{count, value: decoder.readUint53()}]
  } else if (count < 0) {
    count = -count
    let literal = []
    for (let i = 0; i < count; i++) literal.push({count: 1, value: decoder.readUint53()})
    return literal
  } else { // count == 0
    return [{count: decoder.readUint53(), value: null}]
  }
}

function numOccurrences(decoder, expectedValue) {
  let records = readRLE(decoder)
  assert.strictEqual(records.length, 1)
  assert.strictEqual(records[0].value, expectedValue)
  return records[0].count
}

function readTextFromFile() {
  const decoder = new Decoder(fs.readFileSync('paper.doc.crdt')) // this file is written by compress.js
  decoder.readRawBytes(9) // magic, checksum, chunk type
  decoder.readUint53() // chunk length
  const actors = [], numActors = decoder.readUint53()
  for (let i = 0; i < numActors; i++) {
    actors.push(decoder.readHexString())
  }
  decoder.readRawBytes(32 * decoder.readUint53()) // heads

  readColumns(decoder, decoder.readUint53()) // change columns
  const columns = readColumns(decoder) // ops columns

  assert.strictEqual(columns[1].columnId, CHANGE_COLUMNS.objCtr)
  let skipOps = numOccurrences(columns[1].decoder, null)
  let readOps = numOccurrences(columns[1].decoder, 1) // objCtr == 1 is the text object

  // We're assuming each operation on the text object has a 1-byte UTF-8 value.
  // Check that this is actually true. Will fail if the document is not plain ASCII.
  assert.strictEqual(columns[9].columnId, CHANGE_COLUMNS.valLen)
  assert.strictEqual(numOccurrences(columns[9].decoder, 0), skipOps)
  assert.strictEqual(numOccurrences(columns[9].decoder, (1 << 4) | 6), readOps) // 1 = length, 6 = UTF8 type tag

  assert.strictEqual(columns[10].columnId, CHANGE_COLUMNS.valRaw)
  assert.strictEqual(columns[13].columnId, CHANGE_COLUMNS.succNum)
  const valDecoder = columns[10].decoder, succDecoder = columns[13].decoder
  const textEncoder = new Encoder()

  while (readOps > 0) {
    for (let succ of readRLE(succDecoder)) {
      if (skipOps > 0) {
        succ.count -= skipOps
        skipOps = 0
        assert(succ.count >= 0)
      }
      if (succ.count > readOps) succ.count = readOps
      readOps -= succ.count

      const span = valDecoder.readRawBytes(succ.count)
      // If there are no successors, that means the characters have not been deleted
      if (succ.value === 0) textEncoder.appendRawBytes(span)
    }
  }
  return utf8ToString(textEncoder.buffer)
}

for (let i = 0; i < 10; i++) {
  console.time('readTextFromFile')
  assert.strictEqual(readTextFromFile(), finalText)
  console.timeEnd('readTextFromFile')
}
