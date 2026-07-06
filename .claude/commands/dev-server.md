Start the Next.js dev server for pokefuta, or report its status if already running.

Steps:
1. Check if the dev server is already running:
   `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`
   - If 200: report "Dev server is already running at http://localhost:3000" and stop.

2. If not running, start the server in the background:
   Use the Bash tool with `run_in_background: true` to run: `npm run dev`
   Working directory: /Users/nishiokya/git/pokefuta

3. Wait for the server to become ready by polling:
   Retry `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` up to 15 times with 2-second intervals until it returns 200.

4. Once ready, report:
   ```
   Dev server started at http://localhost:3000
   ```
   If it never becomes ready within the timeout, report the failure.
