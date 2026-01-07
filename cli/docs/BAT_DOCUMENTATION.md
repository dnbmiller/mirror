# Block Applicability Tool (BAT) Documentation

The Block Applicability Tool (BAT) is a command-line utility used to generate projected versions of source files based on a product line configuration. It allows developers to maintain a single codebase for multiple product configurations by using feature and configuration tags to conditionally include or exclude code blocks.

## Table of Contents
1. [Overview](#overview)
2. [Usage](#usage)
3. [Configuration File](#configuration-file)
4. [Tagging Syntax](#tagging-syntax)
    - [Feature Tags](#feature-tags)
    - [Configuration Tags](#configuration-tags)
    - [Substitutions](#substitutions)
5. [Processing Logic](#processing-logic)

## Overview

BAT processes a list of source files and an applicability configuration file. For each source file, it parses the content looking for specific tags. It then evaluates these tags against the provided configuration (features and settings) to determine which parts of the file should be preserved, removed, or substituted. The result is written to an output directory, organizing the projected files by configuration.

## Usage

The tool is typically run via `cargo run` or as a compiled binary.

### Command Line Arguments

```bash
cargo run -- [OPTIONS] --applicability-config <PATH> --out-dir <PATH> --srcs <PATHS>...
```

| Argument | Short | Description |
| :--- | :--- | :--- |
| `--applicability-config` | `-a` | Path to the JSON configuration file containing valid applicabilities, configurations, and substitutions. |
| `--out-dir` | `-o` | The output directory where processed files will be saved. |
| `--srcs` | `-s` | List of input files to process. Can be comma-separated. |
| `--begin-comment-syntax` | `-b` | Override start comment syntax (default: `//`). |
| `--end-comment-syntax` | `-e` | Override end comment syntax (optional). |
| `--use-direct-output` | `-u` | Use output path directly instead of mirroring input directory structure. |
| `--no-write-config-folder` | `-n` | Do not create a subfolder for the configuration name in the output directory. |
| `--verbose` | `-v` | specific verbosity level (e.g., `-v`, `-vv`, `-vvv`). |

### Example

```bash
cargo run -- \
  --applicability-config config.json \
  --out-dir output/ \
  --srcs src/main.cpp,src/utils.cpp
```

## Configuration File

The configuration file is a JSON array of objects. Each object defines a configuration (product) or a configuration group.

### Structure

```json
[
    {
        "name": "PRODUCT_A",
        "group": "Series1",
        "features": [
            "ENGINE=V8",
            "SUNROOF=Included",
            "NAVIGATION=Excluded"
        ],
        "substitutions": [
            { "matchText": "COMPANY_NAME", "substitute": "Acme Corp" }
        ]
    },
    {
        "name": "Series1",
        "configs": ["PRODUCT_A", "PRODUCT_B"],
        "features": [
            "WHEELS=4"
        ]
    }
]
```

- **`name`**: Unique identifier for the configuration or group.
- **`group`**: (Optional) The group this configuration belongs to.
- **`configs`**: (For groups) List of configurations included in this group.
- **`features`**: List of strings representing feature states. Format: `FeatureName=Value`. If `=Value` is omitted, it defaults to `=Included`.
- **`substitutions`**: (Optional) List of text replacements to apply.

## Tagging Syntax

BAT looks for tags inside comments to avoid breaking valid code. The comment syntax is defined by `--begin-comment-syntax` and `--end-comment-syntax`.

### Feature Tags

Use `Feature` tags to conditionally include code based on feature values.

**Syntax:**
```
<StartComment> Feature[<FeatureName>=<Value>] <EndComment>
    Code to include if feature matches
<StartComment> End Feature <EndComment>
```

**Example (C++ style):**
```cpp
// Feature[ENGINE=V8]
void initV8() {
    // ...
}
// End Feature
```

You can also handle the "else" case (when the feature does not match):

```cpp
// Feature[ENGINE=V8]
    // V8 specific code
// Feature[ENGINE=V6]
    // V6 specific code
// End Feature
```
*Note: The parser treats subsequent `Feature` tags before an `End Feature` as alternatives (Else-If logic).*

### Configuration Tags

Use `Configuration` tags to include code only for specific products or groups.

**Syntax:**
```
<StartComment> Configuration[<ConfigName>] <EndComment>
    Code for this configuration
<StartComment> End Configuration <EndComment>
```

**Example:**
```cpp
// Configuration[PRODUCT_A]
#define MAX_USERS 100
// End Configuration
```

### Substitutions

Substitutions allow replacing placeholders in the code with values defined in the configuration.

**Syntax:**
```
<StartComment> Substitution[<MatchText>] <EndComment>
```

**Example:**
```cpp
const char* company = "// Substitution[COMPANY_NAME] ";
```
If `COMPANY_NAME` maps to "Acme Corp", the output will contain "Acme Corp".

### Negation
You can also use negation logic.
**Syntax:**
```
<StartComment> FeatureNot[<FeatureName>=<Value>] <EndComment>
```

## Processing Logic

1.  **Parsing**: The tool parses the source file into a syntax tree, identifying text blocks and tags.
2.  **Matching**: It iterates through the tree. For each tag, it checks if the tag's condition (Feature or Configuration) is met by the current configuration being processed.
    -   If a `Feature` tag matches the configuration's feature list, the content inside is kept.
    -   If it doesn't match, the tool looks for alternative branches (like "else" blocks) or removes the block.
3.  **Substitution**: Any `Substitution` tags are replaced with their corresponding values from the configuration.
4.  **Sanitization**: The tree is "sanitized" to produce the final plain text, removing the applicability tags and excluded content.
5.  **Output**: The resulting text is written to a file in the output directory, typically under a subdirectory named after the configuration (e.g., `output/PRODUCT_A/src/main.cpp`).
