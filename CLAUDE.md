# Disco Carrot Pages — Claude Instructions

## Git Workflow

After completing any code changes, always follow this sequence:

1. **Commit** changes to the feature branch
2. **Push** the branch to origin
3. **Create a pull request** via the GitHub MCP tools
4. **Wait for Netlify bot checks to pass** before merging — Netlify watches this repo and runs checks on every PR. Subscribe to PR activity and wait for the green status before proceeding.
5. **Merge the PR** (squash merge) once checks pass

Do not merge immediately after creating the PR — always wait for the Netlify checks to complete first.
