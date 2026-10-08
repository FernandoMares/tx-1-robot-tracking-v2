TX1 TRACKING HMI - INTEGRATED WINDOWS STANDALONE
================================================

SCOPE
-----
The integrated source combines FIFO buffer ordering, manual REMOVE and manual
repositioning, global Mill Order / Destination / Printer selection, diagrams
and SGRT2 weight. Read RELEASE.txt to identify the actual packaged Git commit.
A successful build or HTTP 200 is not commissioning approval.

This package contains server.js, .next, public and runtime dependencies.
Keep its complete structure. It is not the TypeScript source repository.
Node is required; pnpm, Git and an editor are not required to run this ZIP.
Tracking / QMOS / PLC services are separate and are not installed by this ZIP.

REQUIREMENTS AND START
----------------------
Use compatible Windows/Node approved by IT and network access to Tracking.
Previously tested tools: Windows x64, Node 24.21.0, pnpm 10.34.5 for build.
Validate the exact release on the destination machine.

Extract into a new release folder, preserve the previous release and settings,
and coordinate the change of the existing HMI instance on port 3000.
Never stop all Node processes or stop the Tracking API to free an HMI port.

From the approved extracted release, only after the chosen port is free:

  $env:TRACKING_API_PROXY_TARGET = 'http://localhost:8085'
  $env:PORT = '3000'
  .\start.cmd

localhost refers to THIS HMI server. Change the API host only to the approved
Tracking destination. This example connects to a real local service, not an
isolated simulator. Keep the console open during manual operation.

LAUNCHER / PACKAGER LIMITATIONS
-------------------------------
This release keeps the legacy launcher: start.cmd always sets HOSTNAME=0.0.0.0.
Setting HOSTNAME before that script does not restrict its listener. For an
approved loopback-only test, set HOSTNAME and invoke node server.js directly.

The source packager uses pnpm package:windows and fixed output paths. It can
replace existing outputs. Build only in an isolated checkout with no active
deployment or sole backup in those paths. The extended -SourceVersion and
-PackageName options from a separate handoff kit are NOT supported here.

service.ps1, service-settings.example.json and test-deployment.ps1 from that
separate kit are NOT included. Extracting this ZIP does not install a service.
Unattended operation requires an IT-approved wrapper/service configuration and
destination tests. Node alone does not implement a Windows service protocol.

VALIDATION
----------
Read-only health URLs with the example configuration:

  http://localhost:3000/
  http://localhost:3000/tracking-api/api/tracking/status
  http://localhost:8085/api/tracking/status

Check the expected scenario, live data, current release and UI. FIFO requires
LogicalBufferName and QueueSequence; null fields do not confirm real FIFO order.
The generic Tracked bundles list is not the FIFO ordering view; use zone cards.

MANUAL ACTIONS
--------------
REMOVE and Reposition are available in Tracked bundles, but must only be used
with explicit authorization for the selected bundle and operation.
OperatorId is audit text, not authentication. A 202/accepted response is not a
completed action. The UI observes a fresh state and does not automatically
retry POST. If uncertain, consult state and backend audit before repeating.
Manual tracking corrections can affect L2/PLC occupancy and automation.

SECURITY / HANDOFF
------------------
The proxy allowlist is not login, roles or TLS. Coordinate network access,
authorization and telemetry policy with IT. Do not put secrets in NEXT_PUBLIC
variables. Changing public build variables requires rebuilding; changing the
private API target requires restarting the correct process with new settings.

Source documentation contains API, simulator, deployment, commissioning,
version status and Git transfer guides. It is a separate deliverable.
Rollback restores the frontend, not backend selections or corrections already
accepted. Do not label historical ZIPs as integrated merely by renaming them.
