  # Clone your branch
  git clone -b add-configurable-context-window https://github.com/pablooliva/cccontext.git
  cd cccontext

  # Install and build
  npm install
  npm run build

  # This creates the dist/cli.js file
  # Now link it globally
  npm link

  # Run with your environment variable
  CCCONTEXT_WINDOW_SIZE=200000 cccontext