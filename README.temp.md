# Use with Custom Context Window Size

You can use this tool with a custom context window size by setting the `CCCONTEXT_WINDOW_SIZE` environment variable.

## Using NPX

```bash
CCCONTEXT_WINDOW_SIZE=200000 npx github:pablooliva/cccontext#add-configurable-context-window
```

Optionally, set an alias for the command:

```bash
alias cccontext="CCCONTEXT_WINDOW_SIZE=200000 npx github:pablooliva/cccontext#add-configurable-context-window"
```

## Cloning and Running Locally

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
