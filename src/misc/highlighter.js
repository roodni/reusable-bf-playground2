import ace from "ace-builds";
import "ace-builds/src-noconflict/mode-ocaml";

const OCamlHighlightRules = ace.require(
  "ace/mode/ocaml_highlight_rules",
).OcamlHighlightRules;

class BfmlHighlightRules extends OCamlHighlightRules {
  constructor() {
    super();
    this.$rules.start.unshift({
      token: "comment",
      regex: "//.*$",
    });
  }
}

const TextMode = ace.require("ace/mode/text").Mode;
const OCamlMode = ace.require("ace/mode/ocaml").Mode;

export class BfmlMode extends OCamlMode {
  constructor() {
    super();
    this.HighlightRules = BfmlHighlightRules;
  }
}

const p = BfmlMode.prototype;
p.$id = "ace/mode/bfml";

// ocamlではtoggleCommentLinesが上書きされているが元に戻す
p.lineCommentStart = "//";
p.blockComment = { start: "(*", end: "*)", nestable: true };
p.toggleCommentLines = TextMode.prototype.toggleCommentLines;
