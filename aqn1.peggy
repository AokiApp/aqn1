// AQN1 Peggy grammar
//
 // Supports selectors changed to include decode(), and modifiers line kept the same
// Supports selectors: .index(n), .tag(t), .decode()
 // Supports modifiers: @tlvhex, @tlv, @int, @count, @utf8, @hex, @auto, @type
// Allows hexadecimal (0x..) and decimal numbers; indices are zero-based.
//
 // AST: { type: "Query", selectors: [{type:"index", value:n}, {type:"tag", value:t}, {type:"decode"}, ...], modifier: "tlvhex" | "tlv" | "int" | "count" | "utf8" | "hex" | "auto" | "type" | null }
//
//
start
  = _ q:query _ end { return q; }

query
  = ops:operation* mod:modifier? { return { type: "Query", selectors: ops, modifier: mod ? mod.value : null }; }

operation
  = "." _ "index" _ "(" _ n:number _ ")" _ { return { type: "index", value: n }; }
  / "." _ "tag" _ "(" _ t:number _ ")" _ { return { type: "tag", value: t }; }
  / "." _ "decode" _ "(" _ ")" _ { return { type: "decode" }; }

modifier
  = "@" _ m:("tlvhex" / "tlv" / "int" / "count" / "utf8" / "hex" / "auto" / "type") _ { return { type: "modifier", value: m }; }

number
  = hexNumber
  / decimalNumber

hexNumber
  = "0x" hex:hexDigit+ { return parseInt(hex.join(""), 16); }

decimalNumber
  = digits:[0-9]+ { return parseInt(digits.join(""), 10); }

hexDigit
  = [0-9a-fA-F]

_ "whitespace"
  = [ \t\n\r]*

end
  = !.