# Repository Workflow

- Always implement new features on a new branch.
- Open a pull request for the feature branch before merging.
- Squash and merge the pull request into `main` after approval/checks.
- If a feature is very large or broad in scope, ask for permission before creating the branch or starting the work.
- GitHub CLI access is available: `gh` is installed and authenticated for this repository, so use it for PR creation, checks, and merges when requested.
- Use the installed local Google Chrome to test and validate browser-facing changes. For 3D or WebGL work, a WebGL-unavailable fallback is not sufficient visual QA: run the app in local Chrome with WebGL enabled (software SwiftShader is acceptable), inspect desktop and mobile-landscape views, and capture the relevant rendered states.
- For rendering or performance changes, sample scene objects, draw calls, geometries, textures, and any feature-specific instance budgets more than once while the player stands still; verify that the counts remain bounded and do not grow between samples.
