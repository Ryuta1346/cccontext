# Use with Custom Context Window Size

You can use this tool with a custom context window size by setting the `CCCONTEXT_WINDOW_SIZE` environment variable.

This requires 2 steps:

1. Clone, build and link the project
2. Set alias and/or run the command

## Clone, Build, Link

### Clone branch

```bash
git clone -b add-configurable-context-window https://github.com/pablooliva/cccontext.git
cd cccontext
```

### Install and build

```bash
npm install
npm run build
```

This creates the dist/cli.js file

### Now link it globally

```bash
npm link
```

### Run with your environment variable

```bash
CCCONTEXT_WINDOW_SIZE=200000 cccontext
```
## Using NPX

```bash
CCCONTEXT_WINDOW_SIZE=200000 npx github:pablooliva/cccontext#add-configurable-context-window
```

Optionally, set an alias for the command:

```bash
alias cccontext="CCCONTEXT_WINDOW_SIZE=200000 npx github:pablooliva/cccontext#add-configurable-context-window"
```
