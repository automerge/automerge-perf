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

Each operation has a unique ID that is a pair of (counter,actorId), where actorId is the unique
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

To encode this data efficiently, we can encode the data by individually encoding each column of the
table above:

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
  * Alternative encoding for the `ref` column: note that any non-null reference is always a
    (counter,actorId) pair that is the ID of another row in the same table. In the common case,
    the reference is the ID of the immediately preceding insertion. We could encode this by a
    number that is the relative offset of the row being referenced (e.g. -1 references the
    preceding row, -2 references the row two above, etc).
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
be fairly low-cardinality in most cases (so a lookup table and RLE are effective), and we know
that people tend to type text from beginning to end, only occasionally moving their cursor (so
counter values of successive insertion operations tend to form incrementing sequences, so
delta-encoding is effective).

This idea of “column-oriented” or “columnar” encoding is
[quite well established](http://cs-www.cs.yale.edu/homes/dna/papers/abadi-column-stores.pdf)
in analytic databases such as data warehouses, but I haven’t seen it being it used in CRDTs
before.

Prototype evaluation
--------------------

The file `columnar.js` in this directory contains a barebones prototype implementation of this
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
change), e.g. like Hypermerge appends each change as a chunk to a Hypercore, we can still use a
columnar encoding, but the compression will be less effective. Depending on the editing patterns
of a document, it might in some situations be more efficient to send the entire document (encoded
and compressed as a whole) rather than a log of individually encoded changes. We can still merge
two entire documents, since each of them internally is just a set of operations, of which we can
take the union.

Putting together a file format
------------------------------

Besides the encoding above, more is needed before we really have a file format:

* Encoding other object types besides text. This can mostly be quite similar. For example, a map
  object has a set of assignment and deletion operations per key; each such operation has an ID;
  assignment operations reference the set of prior IDs that they overwrite; and deletion
  operations reference the set of prior IDs that they remove.
* Encoding of multiple objects, and references between objects (i.e. which objects are nested
  within which other objects). At the moment we give each object a UUID; I am thinking of instead
  identifying objects with a (counter,actorId) pair, just like operations. This can be encoded
  more compactly, and gives greater consistency to the data model: we can give every operation,
  including object creation operations, a (counter,actorId) identifier.
* Putting together the encoded columns into a flat file. A simple approach would be to give each
  column a minimal header, consisting of a number identifying the column type and a number
  indicating the length in bytes, followed by the encoded column data.
* Extensibility for future features. This is a difficult one. In the future we might want to add
  new object types (say, a set datatype, or a record datatype that follows a strict schema) or new
  operations (say, an assignment that picks the maximum value when there are conflicts). When
  collaborating users are on different versions of the software, we need forward and backward
  compatibility: in particular, it should be possible for a file written with a newer version of
  the software to be read by an older version of Automerge.

  One way of implementing this would be to tag each column with a number indicating its type, and
  for the software to ignore any column types that it does not recognise (by analogy, in a JSON
  setting, you can ignore any unknown field names in an object). However, this does not work well
  when the document can be edited using the old version of the software, since the correct
  interpretation of columns rely on all columns containing rows in the same order. If the software
  inserts rows in the columns that it understands, and leaves those columns that it does not
  understand unchanged, then the data would be broken.

  Perhaps this means that we have to fix a set of column encodings (such as UTF-8 text, and RLE
  numbers); when new column types are added, they must use one of these set encodings that we know
  how to manipulate.

In-memory data representation
-----------------------------

An interesting extension is to consider using a columnar format not only for writing to disk and
sending over the network, but also for Automerge’s run-time in-memory state. At the moment, the
in-memory state is also very heavyweight: e.g. for the text datatype, every character is
a JavaScript object with references to predecessor and successor, which is part of a skip list
structure, which is in turn based on an Immutable.js Map object, which is made from lots more
JavaScript objects… I haven’t analysed in detail, but in total there must be dozens of pointers
for every character of a text document, and at 64 bits apiece, this adds up to quite substantial
memory use.

The columnar encoding, as described above, is not directly suitable for Automerge’s run-time state:
for example, the UTF-8 text content is represented as one long byte array, and thus inserting
a character in the middle would require copying all the subsequent text to make space for the new
insertion, which would be inefficient.

However, we can make a compromise between the two approaches. Say, for example, that we split the
text into roughly 100-character blocks (exact value to be determined experimentally), use the
columar approach to encode the columns of each block as byte arrays, and then arrange those blocks
into a tree. Inserting a character then requires copying up to 100 bytes, which might be fairly fast
compared to traversing a large structure with lots of pointers, since the short byte array maps
nicely to CPU cache lines. And the tree structure would now be ~100 times smaller, since the
smallest unit of the tree is now a 100-character block rather than a single character.

For a text CRDT, two commonly needed functions are to translate the unique ID of a character into an
index in the document (i.e. locating a character ID), and vice versa. Translation from index to
character ID is easy: each tree node is labelled with the number of characters contained within its
subtree, so we can traverse the tree to find the appropriate block, and then decode the ID column
to find the n-th ID within it.

For the reverse direction, translating from ID to index, we can proceed as follows: each node of the
tree has an associated Bloom filter containing the IDs of all characters contained within its
subtree. A parent node’s Bloom filter is the union of its children’s Bloom filters. To search for an
ID, traverse all subtrees for which the Bloom filter indicates a hit; when we reach a leaf node,
decode the ID column to see whether the ID really is there. Bloom filter false positives only incur
a slight performance cost of sometimes unnecessarily decoding a block. Once an ID is found, move
back to the root of the tree and use the number-of-character labels to calculate the index of the
character within the document.

When a block gets bigger than (say) 100 characters, we can split it into two adjacent blocks, just
like in a B-tree. Some of the column types could handle the addition of a new operation without even
needing to copy much: as mentioned previously, it might be sufficient to increment the repetition
count for a value, which could be done by just overwriting a byte or two in-place. Note that here we
can potentially get performance gains by using a mutable representation for Automerge’s internal
state. We can contemplate using mutable internals even while keeping the external API immutable. But
we should do some experiments to weigh up the trade-offs here.

As working title I propose calling this tree structure a CoBB-tree (Column-oriented Bloom B-tree).
Although a Cobb salad isn’t exactly lightweight. 😎

Multiple branches
-----------------

We’ve talked about how it would be desirable to support Git-like branching and merging in Automerge.
The CoBB-tree also gives us a way of doing this fairly well, I think.

Firstly, we merge all of the operations from all of the branches into a single object with a single
columnar encoding. This works even for text, because in the CRDT we’re using, the relative order of
two character IDs in the text never changes (this is still true with our move operation as well).
Thus, for a text object we have a single sequence of character IDs, containing all the character IDs
created on any of the branches. We can have any number of different character values associated with
each character ID.

Different branches may associate a different character with a given ID (or none). Given a particular
branch, we now need to figure out what the actual character sequence for the document version on
that branch is. We can do this by maintaining a vector clock for each branch. For each actorId
that has generated operations, the vector clock contains the highest operation counter value that
is part of that branch. As counter values are generated in monotonically increasing order per-actor,
this threshold for each actorId characterises exactly which operations are or are not part of the
branch.

Now, for every character ID in the sequence, we have a set of operations that associate values with
that character ID. For each branch, we can now efficiently find the subset of operations that exist
on that branch, simply by looking up the actorId part of the character ID in the branch’s vector
clock. Then we can work out what the value is on that branch: the value of any assignment or
insertion operations that exist on the branch, such that there is no other assignment or deletion
operation on that branch that overwrites or removes the value again. If there is no such value, it
means there is no visible character at that position in the text on that branch (it either has been
deleted, or not yet created). If there is more than one value, we have a conflict due to concurrent
assignment.

(This is sort of a generalisation of the MVCC concurrency control method found in databases like
PostgreSQL, where it is used to present consistent point-in-time snapshot views of the database to
transactions.)

To diff the documents on two branches, we scan over the sequence and find any character IDs for
which the subsets of visible operations on the two branches differ.

For translating between character IDs and document indexes, as per the last section, each tree node
needs to maintain a separate character count for each branch (counting only characters that are
visible on that branch). The remaining data structures (Bloom filters, columnar data blocks) can be
shared between all the branches. This makes branches cheap in terms of both memory use and
computational overheads.
