# Publishing agreement

The user authorizes automatic publication of future verified changes in this project without asking again (2026-09-11).

- After verification, commit only files belonging to the current task and push to `origin/main` at https://github.com/kj-calculus/interview_as.git, then synchronize the same commit to the existing Sites source repository and deploy updates to the existing online Site.
- Preserve unrelated changes and stored account data. Never force-push or overwrite divergent history.
- Stop and explain failed validation, unavailable authentication, or divergence.
- GitHub is the primary source repository. The separate Sites source repository identified by `.openai/hosting.json` is used for deployment; obtain its short-lived write credential through Sites tools and never store its token in Git configuration or files.
- Report the deployment URL and commit hash after successful publication.
