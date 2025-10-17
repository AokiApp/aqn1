# Abstract Query Notation 1 (AQN1)

Abstract Query Notation 1 (AQN1) is a formal language designed for retrieving ASN.1 encoded data structures. It's just like jq for JSON, XPath for XML, but for ASN.1.

## Syntax

The syntax of AQN1 is inspired by existing query languages, making it intuitive for users familiar with those. It allows for selecting, filtering, and transforming ASN.1 data structures.

### Glossary

- Element: A single ASN.1 data item, which can be either primitive (leaf) or constructed (branch).
- Selector: A component of the query that specifies to retrieve certain elements based on their position or tag.
- Modifier: A component of the query that specifies how to format or transform the output.
- to select: The action of retrieving specific elements from the ASN.1 structure based on the query. You can not select multiple elements at once. 

### Basic Structure

An AQN1 query consists of
- **Selectors**: Used to navigate through the ASN.1 elements.
- **Modifiers**: Used to specify the output format or transformation.

### Selectors

- `.index(n)`: Selects the nth element. Indices are zero-based.
- `.tag(t)`: Selects the first element with the specified tag `t`. Tags can be specified in decimal or hexadecimal (e.g., `0x02` for INTEGER).
- `.decode()`: If OCTET STRING or BIT STRING is selected, decodes its content as ASN.1 and selects the resulting structure.

### Modifiers

- `@tlv`: Outputs the selected elements in binary format including Tag and Length headers. Of course, for constructed types, the output will include all nested elements and its headers.
- `@int`: If the selected element is an INTEGER, outputs its value as a signed integer.
- `@count`: If the selected element is a constructed type, outputs the number of elements in the constructed type.
- `@utf8`: If the selected element is a string type (e.g., UTF8String, IA5String), outputs its value as a UTF-8 string.
- `@hex`: If the selected element is a primitive type, outputs its value in hexadecimal format without Tag and Length headers. If the selected element is a constructed type, outputs the inner content in hexadecimal format. Each inner element has its Tag and Length headers, but the outer constructed type's Tag and Length headers are omitted.
- `@tlvhex`: Outputs the selected data in hexadecimal format with Tag and Length headers. Both primitive and constructed types are supported and the full TLV structure is preserved.
- `@auto`: Automatically determines the best output format based on the tag.
- `@type`: Outputs the ASN.1 type of the selected element. e.g., INTEGER, OCTET STRING, SEQUENCE, APPLICATION 3, CONTEXT 0, PRIVATE 15, etc.
- `@pretty`: Outputs a human-readable representation of the selected element, showing its structure and values in a formatted way.

### Example Queries

```
.index(0).index(0x1)@tlv -- Selects the first element of a sequence, then the 2nd element of the resulting structure. The indices can be specified in decimal or hexadecimal. Lastly, the `@tlv` modifier indicates that the output should be in binary with Tag and Length headers.
```

```
.tag(0x02)@int -- Selects all elements of tag 0x02 (Universal, primitive type, Integer). The tag can be specified in hexadecimal. The `@int` modifier indicates that the output should be interpreted as an integer.
```

```
.tag(0xa0).index(1).tag(0x04)@hex -- Selects all elements of tag 0xa0 (Context-specific, constructed type). From those, it selects the 2nd element (index 1), and then selects all elements of tag 0x04 (Universal, primitive type, Octet String). The `@hex` modifier indicates that the output should be in hexadecimal format.
```

```
.tag(0x16)@utf8 -- Selects all elements of tag 0x16 (Universal, primitive type, IA5String). The tag can be specified in hexadecimal. The `@utf8` modifier indicates that the output should be decoded as a UTF-8 string.
```

```
@utf8 -- Outputs the entire ASN.1 structure decoded as a UTF-8 string.
```


## Errors

The following errors may be encountered when using AQN1:
- **Invalid Query Syntax**: The query does not conform to the AQN1 grammar.
- **Index Out of Bounds**: An index specified in the query exceeds the number of elements in the selected structure.
- **Tag Not Found**: No elements with the specified tag exist in the selected structure.
- **Invalid Modifier**: A modifier specified in the query is not recognized.
- **Incompatible Output Format**: The selected data cannot be represented in the specified output format (e.g., trying to interpret a non-integer as an integer).
- **Value Error**: The selected value cannot be processed as requested (e.g., decoding a non-string value as UTF-8).

## CLI Tool

An optional command-line tool is bundled.

### Usage


```bash
npx @aokiapp/aqn1 ".index(0).tag(0x02)@int" < data.asn1
```

### Options
- `-h, --help`: Display help information about the CLI tool.
- `-v, --version`: Display the version of the CLI tool.


## License

This project is licensed under the AokiApp Normative Applicable License - Tight (ANAL-Tight). See [License](https://github.com/AokiApp/ANAL/blob/main/licenses/ANAL-Tight-1.0.1.md) for details.




