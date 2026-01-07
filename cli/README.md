# Block Applicability Tool (BAT)

The Block Applicability Tool (BAT) is a utility for managing product line configurations in source code. It allows you to generate specific product builds from a common codebase using feature and configuration tags.

## Documentation

For detailed documentation on usage, configuration, and syntax, please refer to [BAT_DOCUMENTATION.md](docs/BAT_DOCUMENTATION.md).

## Quick Start

### Running as a developer

To run the tool using Cargo:

```bash
cargo run -- <config_file> <output_dir> <source_files> <comment_syntax> [end_comment_syntax]
```

**Parameters:**
1.  **Applicability Config**: Path to the JSON configuration file.
2.  **Output Directory**: Path where processed files will be saved.
3.  **Source Files**: Comma-separated list of files to process. Terminated by `;` or space if using flags.
4.  **Comment Syntax**: The start comment syntax (e.g., `//`, `#`).
5.  **End Comment Syntax**: (Optional) The end comment syntax (e.g., `*/`).

**Example:**
```bash
cargo run -- config.json output/ src/main.cpp //
```

See the full documentation for advanced usage and command-line flags.
