import ace from "ace-builds";
import "ace-builds/src-noconflict/mode-ocaml";

ace.define("ace/mode/bfml_highlight_rules", function (require, exports) {
  const OCamlHighlightRules =
    require("ace/mode/ocaml_highlight_rules").OcamlHighlightRules;

  class BfmlHighlightRules extends OCamlHighlightRules {
    constructor() {
      super();
      this.$rules.start.unshift({
        token: "comment",
        regex: "//.*$",
      });
    }
  }

  exports.BfmlHighlightRules = BfmlHighlightRules;
});

ace.define("ace/mode/bfml", function (require, exports) {
  const TextMode = require("ace/mode/text").Mode;
  const OCamlMode = require("ace/mode/ocaml").Mode;
  const BfmlHighlightRules =
    require("ace/mode/bfml_highlight_rules").BfmlHighlightRules;

  class Mode extends OCamlMode {
    constructor() {
      super();
      this.HighlightRules = BfmlHighlightRules;
    }
  }

  (function () {
    this.$id = "ace/mode/bfml";

    // ocamlではtoggleCommentLinesが上書きされているが元に戻す
    this.lineCommentStart = "//";
    this.blockComment = { start: "(*", end: "*)", nestable: true };
    this.toggleCommentLines = TextMode.prototype.toggleCommentLines;
  }).call(Mode.prototype);

  exports.Mode = Mode;
});
