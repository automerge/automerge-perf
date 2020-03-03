Benchmarking resources for Automerge
====================================

Stuff that can be found here:

* `editing-trace.js` (NB. big file: 4.5 MB) contains the character-by-character
  editing trace of the LaTeX source of [this paper](https://arxiv.org/abs/1608.03960).
  It exports two variables: `edits` is an array of 259,778 one-character insertions or
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
* `google-realtime-api` contains an experiment of trying to replay the editing trace
  against the now-defunct [Google Realtime API](https://developers.google.com/realtime/deprecation).
* `columnar` contains an experimental compressed binary encoding for Automerge data.
