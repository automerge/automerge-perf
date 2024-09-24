Benchmarking resources for Automerge
====================================

This repository contains data and code for performance tests of
[Automerge](https://github.com/automerge/automerge). In particular, it
contains the character-by-character editing trace of a large-ish text
document, the LaTeX source of [this paper](https://arxiv.org/abs/1608.03960).
That editing trace consists of:

* 182,315 single-character insertion operations
* 77,463 single-character deletion operations
* 102,049 cursor movement operations

The [final text document](https://github.com/trvedata/json-crdt-tpds/blob/master/trvesync.tex)
contains 104,852 ASCII characters (= 182,315 – 77,463).
We produced that editing trace by writing the entire paper in a
[homegrown text editor](https://github.com/trvedata/trvesync/blob/master/ruby/bin/crdt-editor).
We don't recommend actually using that editor, because it's terribly slow, and
it lacks convenient features such as copy&paste.

The final version of the paper is published as:

> Martin Kleppmann and Alastair R. Beresford. A Conflict-Free Replicated JSON Datatype.
> IEEE Transactions on Parallel and Distributed Systems 28(10):2733–2746, April 2017.
> [doi:10.1109/TPDS.2017.2697382](https://doi.org/10.1109/TPDS.2017.2697382)

Here is a description of each of the subdirectories of this repository:

edit-history
------------

`edit-history/paper.json.gz` contains the complete editing trace of the paper
in Automerge's JSON change format (the variant used on the `performance` branch).
It contains 332,702 changes, including an initial change that creates a Text
object for the text document, and a map to contain the cursors. Most changes
contain just a single operation, but a few changes contain multiple operations
(in particular, a character deletion and a cursor movement in the same change;
this happens when the delete key was used to delete the character after the
cursor).

You can use [jq](https://stedolan.github.io/jq/) to inspect the operations:

* insertions: `jq -c '.ops[] | select(.insert==true)'`
* deletions: `jq -c '.ops[] | select(.action=="del")'`
* cursor movements: `jq -c '.ops[] | select(.obj | startswith("2@"))'`

`compress.js` reads this editing trace, calls into the Automerge code to encode
it using Automerge's binary change format, and writes out the binary-encoded
data to new files.

edit-by-index
-------------

* `editing-trace.js` (NB. big file: 4.5 MB) contains the editing trace as a list of
  calls to [Array.splice](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/splice)
  (that is, each edit identifies the insertion/deletion position by index).
  Cursor movements are omitted. This file exports two variables:
  `edits` is an array of 259,778 one-character insertions or
  deletions, and `finalText` is a string containing the final state of the document.
  (Although the original document did have some concurrent editing, this trace has
  been flattened into a linear editing history to make things easier.)
* `baseline.js` shows how to interpret the editing trace by replaying it using a
  normal JavaScript array (and checks that the final result is as expected).
  It takes about 5-6 seconds to run on Martin's laptop. That gives us an idea of
  how fast things *could* be.
* `automerge-text.js` replays the editing history using Automerge.Text, with a
  separate change per character edit. It starts reasonably fast, but gradually grinds
  to a halt as the document grows. As of March 2020, on Martin's laptop, the first
  10,000 operations are replayed in 1.6 s, and the first 100,000 operations in 43 s.
  It runs out of memory after processing 235,000 operations (using the default Node
  heap size, which seems to be about 1.4 GB or so).


google-realtime-api
-------------------

An experiment of trying to replay the editing trace against the now-defunct
[Google Realtime API](https://developers.google.com/realtime/deprecation).

columnar
--------

An experimental compressed binary encoding for Automerge data.
See the README in this directory for details.

License
-------

All material in this repository, including the editing trace, is made available under a
[Creative Commons Attribution 4.0 International License][cc-by] (CC-BY).

[![CC BY 4.0][cc-by-image]][cc-by]

[cc-by]: http://creativecommons.org/licenses/by/4.0/
[cc-by-image]: https://i.creativecommons.org/l/by/4.0/88x31.png

The final version of the research paper that is being written in the editing trace is
[published](https://doi.org/10.1109/TPDS.2017.2697382) in IEEE Transactions on Parallel and
Distributed Systems, and copyright in this paper has been assigned to the IEEE. However, the
editing trace contains a lot more information than the final paper, and so we believe that the
copyright assignment does not cover this editing trace. We are therefore able to make it available
under the liberal CC-BY license. All authors of the papers have consented to making the editing
trace publicly available.
