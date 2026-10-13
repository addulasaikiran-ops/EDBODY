# EDBODY Desktop

EDBODY is an installable desktop research prototype built with Electron, React, TypeScript and Three.js. It includes a selectable 3D schematic human, local demo health profile, meal-response experiment screen and model registry.

## Run
Requirements: Node.js 20+ and npm.

```sh
npm install
npm run dev
```

Package for the current operating system with `npm run dist`. Outputs are written to `release/`.

## Safety and current limitations
This is a software prototype, not a medical product. The 3D body is schematic rather than anatomically precise. The meal-response function is an illustrative curve generator, not a validated physiological model. Do not use its output for diagnosis, treatment, medication decisions or dietary health decisions.

Profile values are demo data held in application memory only. Do not enter real patient data until consent-aware secure storage, access controls and auditing are implemented. The whole-body architecture is prepared for future model adapters, but no clinical model is currently validated by this application.

Review all third-party model and anatomical-asset licenses before adding them or distributing the app.
## Patient-specific anatomy segmentation (optional)

EDBODY can optionally invoke an independently installed [TotalSegmentator](https://github.com/kosmv/TotalSegmentator) CLI for local CT/MRI organ segmentation. See [the integration guide](docs/TOTALSEGMENTATOR.md) for setup, supported inputs, licensing notes, safety limits and current gaps. The CLI and its model weights are **not bundled** in EDBODY installers.
