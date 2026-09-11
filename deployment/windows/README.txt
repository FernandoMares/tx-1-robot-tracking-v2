TX1 TRACKING HMI - WINDOWS STANDALONE PACKAGE
================================================

This package contains the compiled application and its minimum runtime
dependencies. It does not contain the TypeScript/TSX source repository,
Git history, development tools, or the project's .env.local file.

REQUIREMENTS
------------
- Windows x64
- Node.js installed and available as "node"
- Network access from this server to MaterialTrackingService

QUICK START
-----------
1. Extract the complete ZIP into its own directory.
2. Confirm that MaterialTrackingService responds on:
     http://localhost:8085/api/tracking/status
3. Run start.cmd.
4. Open:
     http://localhost:3000
   or, from the same authorized network:
     http://SERVER_IP:3000

RUNTIME CONFIGURATION
---------------------
start.cmd uses these defaults:

  TRACKING_API_PROXY_TARGET=http://localhost:8085
  HOSTNAME=0.0.0.0
  PORT=3000

To use a different approved API target or port, define the environment
variables before starting the application. Do not put database credentials
or secrets in NEXT_PUBLIC_* variables.

VALIDATION
----------
After startup, verify both URLs:

  http://localhost:3000/
  http://localhost:3000/tracking-api/api/tracking/status

The HMI must show Live API and must never fall back silently to simulated
data when the tracking service is unavailable.

OPERATION
---------
For unattended operation, register node server.js as a Windows service or
scheduled startup task with the working directory set to this folder. Define
TRACKING_API_PROXY_TARGET, HOSTNAME, and PORT in that service configuration.

Keep the previous release directory until the new release has passed its
connectivity and Mill Order assignment checks.
