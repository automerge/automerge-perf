const fs = require('fs')
const leb = require('leb') // https://en.wikipedia.org/wiki/LEB128
const messages = JSON.parse(fs.readFileSync('perf.json', 'utf8')).messages

// This API is provided natively by Chrome and Firefox, but not by Node.
// https://developer.mozilla.org/en-US/docs/Web/API/TextEncoder
const { TextEncoder, TextDecoder } = require('text-encoding')
const utf8encoder = new TextEncoder()

class Encoder {
  constructor () {
    this.buf = new Uint8Array(65536)
    this.offset = 0
  }

  write (data) {
    if (this.offset + data.byteLength >= this.buf.byteLength) {
      const newBuf = new Uint8Array(this.buf.byteLength * 4)
      newBuf.set(this.buf, 0)
      this.buf = newBuf
    }

    this.buf.set(data, this.offset)
    this.offset += data.byteLength
  }

  finish () {
  }
}

class RLEEncoder extends Encoder {
  constructor (valueEncoder) {
    super()
    this.valueEncoder = valueEncoder
    this.lastValue = undefined
    this.count = 0
  }

  write (value) {
    if (this.lastValue === undefined) {
      this.lastValue = value
    }

    if (this.lastValue === value) {
      this.count += 1
    } else {
      super.write(this.valueEncoder(this.lastValue))
      super.write(leb.encodeUInt32(this.count))
      this.lastValue = value
      this.count = (value === undefined ? 0 : 1)
    }
  }

  finish () {
    this.write(undefined)
  }
}

class DeltaEncoder extends RLEEncoder {
  constructor () {
    super(leb.encodeInt32)
    this.lastInput = 0
  }

  write (input) {
    super.write(input - this.lastInput)
    this.lastInput = input
  }
}

let opTypes = new RLEEncoder(leb.encodeUInt32)
let insertedStrings = new Encoder()
let insertedLengths = new RLEEncoder(leb.encodeUInt32)
let opIdCounters = new DeltaEncoder()
let originNodes = new RLEEncoder(leb.encodeUInt32)
let refCounters = new DeltaEncoder()
let refNodes = new RLEEncoder(leb.encodeInt32)

for (let msg of messages) {
  for (let op of msg.ops) {
    if (op.op === 'insert') {
      opTypes.write(0)
      const val = utf8encoder.encode(op.val)
      insertedStrings.write(val)
      insertedLengths.write(val.byteLength)
    } else if (op.op == 'delete') {
      opTypes.write(1)
    } else {
      continue
    }

    let idMatch = /^(\d+)-(\d+)$/.exec(op.id)
    if (!idMatch || parseInt(idMatch[2]) !== msg.node) throw 'Bad operation ID: ' + op.id
    opIdCounters.write(parseInt(idMatch[1]))
    originNodes.write(msg.node)

    if (op.op === 'insert' && op.ref === null) {
      refCounters.write(-1)
      refNodes.write(-1)
    } else {
      idMatch = /^(\d+)-(\d+)$/.exec(op.ref)
      if (!idMatch) throw 'Bad operation reference: ' + op.ref
      refCounters.write(parseInt(idMatch[1]))
      refNodes.write(parseInt(idMatch[2]))
    }
  }
}

opTypes.finish()
insertedStrings.finish()
insertedLengths.finish()
opIdCounters.finish()
originNodes.finish()
refCounters.finish()
refNodes.finish()

console.log('OpTypes buffer size: ', opTypes.offset)
console.log('Text buffer size: ', insertedStrings.offset)
console.log('Lengths buffer size: ', insertedLengths.offset)
console.log('Operation ID buffer size: ', opIdCounters.offset)
console.log('Origins buffer size: ', originNodes.offset)
console.log('Reference count buffer size: ', refCounters.offset)
console.log('Reference node buffer size: ', refNodes.offset)
console.log('')
console.log('Total size: ', opTypes.offset + insertedStrings.offset + insertedLengths.offset +
            opIdCounters.offset + originNodes.offset + refCounters.offset + refNodes.offset)
