# EDBODY Desktop

EDBODY is an installable desktop research prototype built with Electron, React, TypeScript and Three.js. It includes a selectable 3D schematic human, local demo health profile, meal-response experiment screen and model registry.

## Run the desktop app

Requirements: Node.js 22.12+ and npm.

```sh
npm ci
npm test
npm run dev
```

Run the TypeScript/Vite production build with `npm run build`. Package for the current operating system with `npm run dist`. Outputs are written to `release/`. A Linux-only headless renderer startup check is available in CI using `npm run smoke:linux` (requires `xvfb-run`).

The automated tests cover Electron renderer/IPC trust checks and basic software invariants of the illustrative meal-response demo. They do **not** validate a physiological model or establish clinical accuracy. Use [the baseline smoke-test checklist](docs/BASELINE-VERIFICATION.md) to check the desktop screens and optional integrations.

## Scientific backend scaffold

The project now includes an early Python/FastAPI API foundation. It is **not yet connected to the Electron app**, does not accept or store patient data, and provides no physiological predictions.

See [the backend README](backend/README.md) to run its local health endpoint and tests. See the [technical roadmap](docs/TECHNICAL-ROADMAP.md) for the adopted stack and implementation gates.

## Safety and current limitations

This is a software prototype, not a medical product. The 3D body is schematic rather than anatomically precise. The meal-response function is an illustrative curve generator, not a validated physiological model. Do not use its output for diagnosis, treatment, medication decisions or dietary health decisions.

Profile values are demo data held in application memory only. Do not enter real patient data until consent-aware secure storage, access controls and auditing are implemented. The whole-body architecture is prepared for future model adapters, but no clinical model is currently validated by this application.

Review all third-party model and anatomical-asset licenses before adding them or distributing the app.

## Patient-specific anatomy segmentation (optional)

EDBODY can optionally invoke an independently installed [TotalSegmentator](https://github.com/kosmv/TotalSegmentator) CLI for local CT/MRI organ segmentation. See [the integration guide](docs/TOTALSEGMENTATOR.md) for setup, supported inputs, licensing notes, safety limits and current gaps. The CLI and its model weights are **not bundled** in EDBODY installers.

## Detailed reference anatomy atlas

EDBODY can optionally download and render the simplified BodyParts3D 4.0 atlas with named anatomical meshes. Open **Human twin** and select **Download detailed atlas**. The dataset is downloaded into local app data and is not bundled with the installer. Read [the atlas integration and attribution notes](docs/OPEN-ANATOMY-ATLAS.md) before redistributing atlas data.
