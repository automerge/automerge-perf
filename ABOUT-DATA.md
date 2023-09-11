      ( echo 'const edits = [';
        cat trve.js.gz | gunzip | grep '^text.splice' |
          sed -e 's/^text.splice(/  [/' -e 's/);$/],/';
        echo '  [0, 0]';
        echo '];';
        cat trve.js.gz | gunzip | grep '^if ' | tail -n 1 |
          sed -e "s/^if (text.join('') != /const finalText = /" \
          -e "s/) throw 'mismatch: ' + text.join('');$/;/"
      ) > editing-trace.js

