Experiment: columnar data encoding for Automerge
================================================

Currently, Automerge has a big metadata overhead, especially for text documents, where every
character insertion is an individual operation. The serialized document state (saved to disk
and/or sent over the network) is essentially a log of operations. The current encoding uses
about 240 bytes for each inserted character, which is pretty bad given that the character
itself is only 1 byte (for English text at least).

The purpose of this experiment is to explore a more efficient encoding. Ideally, the encoding
should still be able to represent the full operation history of a document (which enables sync
with other replicas, i.e. sending another replica subsets of the editing history that it is
missing, as well as inspecting and diffing past versions of the document). This means the focus
is on lossless compression. Later we may also consider lossy methods (e.g. creating snapshots
in which editing history is discarded), but only after we have exhausted the lossless options.

Besides space efficiency on disk and on the network, a secondary goal of this experiment is to
see whether it would make sense to also use packed byte arrays as Automerge’s runtime data
structures. The current runtime data structures, such as the
[opset](https://github.com/automerge/automerge/blob/v0.10.1/backend/op_set.js) and the
[skip list](https://github.com/automerge/automerge/blob/v0.10.1/backend/skip_list.js) it uses,
are pretty heavyweight. Even though I think they are asymptotically good (e.g. the skip list
has O(log n) lookup, insertion, and deletion), in practice they are slow, use lots of memory,
and put pressure on the GC. Judicious use of byte arrays instead of pointer-heavy tree
structures may have better “mechanical sympathy”.

Dense encodings
---------------

We can use the [LEB128](https://en.wikipedia.org/wiki/LEB128) for mapping numbers to byte
sequences. With this encoding, small numbers only use one byte, while still allowing large
numbers to be encoded:

* 0 is encoded as `0x00`, 1 is encoded as `0x01`, ..., 63 is encoded as `0x3F`
* -1 is encoded as `0x7F`, -2 is encoded as `0x7E`, ..., -64 is encoded as `0x40`
* 64 is encoded as `0xC0 0x00`, 65 is encoded as `0xC1 0x00`, ..., 8191 is encoded as `0xFF 0x3F`
* -65 is encoded as `0xBF 0x7F`, -66 is encoded as `0xBE 0x7F`, ..., -8192 is encoded as `0x80 0x40`
* 8192 is encoded as `0x80 0xC0 0x00`, etc...

When encoding a sequence of numbers, the LEB128 encodings of the individual numbers can simply
be concatenated. We can tell the boundaries between numbers because the high-order bit of a byte
is zero when that byte is the last byte of a number, and it is one when more bytes are still to
come.

When we have a sequence of numbers in which values tend to be repeated, we can use run-length
encoding (RLE). For example, `[1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2]` could be encoded as
`[8, 1, 3, 2]` (8 copies of the value 1, followed by 3 copies of the value 2).

When we have a sequence of numbers in which a value is often 1 greater than the preceding value,
we can use delta-encoding followed by RLE. In delta-encoding we store the difference between a
value and its predecessor, rather than the value themselves (and the predecessor of the first
value is assumed to be 0). For example, `[10, 11, 12, 13, 14, 15, 16, 17, 3, 4, 5, 6, 7, 8]`
would first be delta-encoded to `[10, 1, 1, 1, 1, 1, 1, 1, -14, 1, 1, 1, 1, 1]`, and then
run-length encoded to `[1, 10, 7, 1, 1, -14, 5, 1]`.

A compression algorithm like LZW might do better than naive RLE (although I don’t think LZW would
be able to efficiently handle an incrementing sequence). However, RLE has the advantage that
certain operation could potentially be performed directly on the compressed data (without
decompressing it into a more verbose data structure). For example, inserting a value into a list,
where the preceding list item is the same value, could be performed on an RLE-encoded list by
incrementing the repetition count for that value. If the LEB128 encoding of the new repetition
count fits into the same number of bytes as the old repetition count, this insertion can be
performed by just overwriting the bytes of the LEB128-encoded repetition count.

Operating directly on compressed data is known as
[vectorized processing](http://cs-www.cs.yale.edu/homes/dna/papers/abadi-column-stores.pdf).
More on this later.

Column-oriented data storage
----------------------------

Next, let’s discuss how to lay out Automerge operation data in such a way that we can take
advantage of the encodings described in the last section. In this section we will focus on the
case of a single `Automerge.Text` object; we will generalise it to other datatypes later.

Think of the set of text editing operations as a table in a relational database. An example might
look like this:

    op_id    op_type ref      value
    -------- ------- -------- -----
    (1,1337) insert  null     'h'
    (6,d00d) delete  (1,1337)
    (7,d00d) insert  null     'H'
    (2,1337) insert  (1,1337) 'e'
    (3,1337) insert  (2,1337) 'l'
    (4,1337) insert  (3,1337) 'l'
    (5,1337) insert  (4,1337) 'o'

Each operation has a unique ID that is a pair of (counter,actorId) where actorId is the unique
name of the actor that generated the operation. In the example above, `1337` and `d00d` are
actorIds. Each operation also references the ID of another operation (the `ref` column): for an
`insert` operation, the reference is the ID of the predecessor character, and for a `delete`
operation, the reference is the ID of the character being deleted. For `insert` operations, the
reference may be `null`, indicating an insertion at the beginning of the document.

Thus, the operation history above represents actor `1337` typing the word `hello`, followed by
actor `d00d` deleting the initial lowercase `h` and replacing it with an uppercase `H`.

Like in a relational database, the order of operations in the table above is arbitrary. Since we
can put the operations in whatever order we like, we can choose an order that will give us an
efficient encoding. Let’s put the operations in the order in which their corresponding characters
appear in the text. In the case of ties (e.g. multiple deletion operations of the same character),
we sort by operation ID.

To encode this data efficiently, . We can then encode the data by individually encoding
each column of the table above:

* The counter part of `op_id` is the sequence `[1, 6, 7, 2, 3, 4, 5]`, for which delta-encoding
  is suitable.
* For the actorId part of `op_id`, we first make a lookup table that maps actorIds to small
  integers, e.g. `1337 -> 0` and `d00d -> 1`. The row-by-row actorIds from the `op_id` column
  then translate to the number sequence `[0, 1, 1, 0, 0, 0, 0]`, for which RLE is suitable.
* The `op_type` column is `[0, 1, 0, 0, 0, 0, 0]`, using a lookup table of `insert -> 0` and
  `delete -> 1`. Again we can use RLE. In this case, as we know there are only two types of
  operation (insert and delete), RLE can even leave out the values, and just give the counts
  for alternating values: for example, `[1, 1, 5]` could represent “one insert, followed by
  one delete, followed by five inserts”.
* The `ref` column can be encoded as two separate sequences for counter and actorId,
  respectively, like for the `op_id` column. `null` values can be encoded by using `-1` for
  counter and actorId.
* For the `value` column, first note that a deletion operation never has a value, and so our
  sequences for this column will only contain six values, while the other sequences contain seven
  values. Next, we construct a sequence of numbers indicating how many bytes are required to
  represent each of the values in an UTF-8 encoding; in the example, this is
  `[1, 1, 1, 1, 1, 1]`, which RLE handles great. Finally, we can store a string that is the
  concatenation of all of the UTF-8 values: `'hHello'` in this example.

Note that this encoding works because for each column we concatenate the values from all of the
rows *in the same order*. For example, if we want to reconstitute the entire row with ID (2,1337),
we should pick the fourth entry from each of the number sequences above — except for the `value`
column, where we pick the third entry (since the deletion does not count for this column).

In the concatenated text of the `value` column, we know where the boundaries between the values
for each of the rows lie because we are explicitly storing the number of bytes for each value.
This means that the value of a row is not limited to being a single Unicode code point; for
example, a value could be a sequence of code points consisting of an emoji plus a skintone
modifier, or a letter plus a diacritic mark. And we can do this at minimal space cost: for most
English documents, the number of bytes per character will be 1, except for the odd emoji, so the
sequence of byte-lengths RLE-encodes to almost nothing. For Chinese documents, the number of
bytes per character will mostly be 3, which compresses just as well. And the concatenated values
will look almost like a plain text document (except that it also includes all deleted portions
of the text), so an additional layer of LZW compression should be effective here.

With the LEB128 encoding, the sequence of numbers for each column is just a concatenated
sequence of bytes. Unlike JSON, there are no field names, and no quotation marks to indicate the
beginning and end of a value, making the encoding vastly more compact than our current approach
of representing each operation as a separate JSON object. We can also take advantage of our
knowledge about typical patterns in the data. For example, we know that the set of actorIds will
be fairly low-cardinality in most cases (so a lookup table is effective), and we know that
people tend to type text from beginning to end, only occasionally moving their cursor (so
counter values of successive insertion operations tend to form incrementing sequences, so
delta-encoding is effective).

This idea of “column-oriented” or “columnar” encoding is
[quite well established](http://cs-www.cs.yale.edu/homes/dna/papers/abadi-column-stores.pdf)
in analytic databases such as data warehouses, but I haven’t seen it being it used in CRDTs
before.

Prototype evaluation
--------------------

The file `columnar.js` in this directory contains a barebones sample implementation of this
approach. It reads a sample dataset from the file `perf.json`. The sample is the
character-by-character editing trace of the LaTeX source of the
[JSON CRDT paper](https://arxiv.org/abs/1608.03960) (we recorded this trace by writing the paper
using a [home-grown text editor](https://github.com/trvedata/trvesync/blob/master/ruby/bin/crdt-editor)).
In this dataset, the actorIds have already been replaced with small integers, so there is no need
for a lookup table.

The dataset contains 361,980 operations: 182,315 single-character insertions, 77,463
single-character deletions, 102,049 cursor movements, and 153 vector clock updates. The result of
applying those operations is
[this LaTeX file](https://github.com/trvedata/json-crdt-tpds/blob/master/trvesync.tex),
104,852 bytes in size (plain text). For the purpose of this experiment we ignore the cursor
movements (since they are usually transient, and don’t need to be stored in the document history)
and the vector clock updates (since there are very few of them). Encoding the remaining operations
(inserts and deletes) using the columnar encoding described above consumes the following space (in
bytes):

    OpTypes buffer size:  15975
    Text buffer size:  182315
    Lengths buffer size:  4
    Operation ID buffer size:  22024
    Origins buffer size:  41
    Reference count buffer size:  64470
    Reference node buffer size:  697

    Total size:  285526

That’s 1.1 bytes per operation on average — a lot better than the approximately 55 bytes per
operation consumed by the JSON representation (and the JSON is already pretty compact, since the
actorId UUIDs have been replaced with one-digit integers). Moreover, additional compression can
be applied: for example, the 182,315 bytes of UTF-8 text data compress to 52,528 bytes with gzip.
With this compression, the encoded document (including the full keystroke-by-keystroke editing
history of the document!) is only slightly larger than the uncompressed plain text file without
any CRDT metadata.

However, one caveat: these compression benefits only kick in because we are encoding the entire
document in one go. If every change is encoded separately (with only a small number operations per
change), e.g. Hypermerge appends each change as a message to a Hypercore, we can still use a
columnar encoding, but the compression will be less effective. Depending on the editing patterns
of a document, it might in some situations be more efficient to send the entire document (encoded
as a whole) rather than a log of individually encoded changes.
