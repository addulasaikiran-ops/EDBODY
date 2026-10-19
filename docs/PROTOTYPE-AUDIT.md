# EDBODY Prototype Audit

**Audit date:** 2026-10-20  
**Repository:** [addulasaikiran-ops/EDBODY](https://github.com/addulasaikiran-ops/EDBODY)  
**Reviewed ref:** `main` at `1c179c587cf312f4e49de7d67987f5d91df16f45`  
**Scope:** Code and repository documentation review. This was not a hands-on launch of the app on a user computer.

## Executive finding

EDBODY is a buildable desktop research prototype with a real user interface, interactive schematic anatomy, optional generic reference atlas, and a local CT/MRI segmentation adapter. It is **not yet a patient-specific physiological digital twin**. Patient records are demo values held in UI state; the meal-response output is explicitly illustrative; segmentation masks are saved separately and are not loaded into the 3D viewer; and no clinical model is currently validated by the app.

## Evidence and current state

| Area | Evidence found | Status / limitation |
|---|---|---|
| Desktop shell | Electron main process, preload bridge, React/TypeScript renderer, Vite build | Implemented |
| Main workspace | Overview, Human Twin, Patient-to-Twin, Simulation Lab, Health Profile, Model Registry | UI implemented |
| Schematic anatomy | Three.js-generated schematic human and organ selection | Visual demonstration; not precise anatomy |
| Generic reference atlas | Optional BodyParts3D 4.0 download and mesh loading, with attribution | Implemented in code; actual download/render still needs a runtime smoke test |
| CT/MRI segmentation | Native file/folder dialogs, TotalSegmentator CLI check/run, logs and cancellation | Adapter implemented, dependent on separately installed CLI and model weights |
| Scan-to-3D workflow | Output is NIfTI masks; documentation says viewer does not yet load them | Not implemented end-to-end |
| Health profile | Sample fields (age, height, weight, baseline glucose, HbA1c, heart rate, blood pressure) in React state | Demo-only, session-only; no general record import, persistence, or version history |
| Physiological simulation | `src/lib/simulation.ts` uses a hand-written illustrative meal-curve equation | Not physiological, not validated, not suitable for health decisions |
| Model registry | Static registry of 11 organ-system entries, one illustrative pathway, zero validated clinical models | Useful readiness UI; not a live model catalog |
| Multi-scenario experiments | Current UI edits one meal scenario and runs one illustrative curve | Side-by-side comparison/history not implemented |
| Security and governance | Electron uses context isolation, disabled renderer Node integration, sandboxed renderer, narrow preload bridge, and native dialogs for scan paths | Helpful desktop boundaries, but not a secure patient-data platform |
| Patient consent, roles, audit, encrypted persistent data | Not implemented in reviewed profile/data flow | Required before any real patient-data deployment |
| Automated tests | `package.json` exposes build/dist scripts but no test script; workflow packages the app | Automated functional/unit test suite not identified |
| CI packaging | GitHub Actions run 38422707763 reports package jobs successful for Windows, macOS, and Linux | Packaging/build evidence only; not runtime or scientific validation |

## Priority findings

### P0 — Keep demo data separate from real patient data

Do not enter real patient data in the current Health Profile. It is stored in in-memory React state and is not backed by consent-aware, encrypted, access-controlled, audited persistence. The app documentation already warns about this.

**Acceptance criteria before real patient records are enabled:** documented data classification; validated import schema with units and provenance; consent/authorization workflow; authentication and role-based authorization; encryption at rest and in transit where applicable; audit events; retention/deletion policy; threat review; and institution-approved test procedures.

### P1 — Add a repeatable runtime smoke-test suite

CI packaging passes, but this does not demonstrate the app's functions work in a live desktop session. There is no identified automated test script or test suite.

Minimum smoke checks:
1. App launches and all six screens open without renderer/main-process errors.
2. Profile edits recalculate displayed BMI and update the selected simulation baseline; closing/reopening confirms the current session-only behavior.
3. The illustrative meal demo produces finite, ordered points over the selected time range and keeps the warning visible.
4. TotalSegmentator unavailable, invalid input, cancelled dialog, failed process, cancellation, and success states are handled.
5. Atlas missing, download/build failure, atlas-ready, and mesh-picking states are handled.
6. Installer is launched at least once on each supported OS, not just built.
7. No real patient data is used during this testing.

### P1 — Make the patient record a real, explicit data model

Introduce a versioned schema for patient metadata and measurements, including units, measurement time, source, provenance, missingness, validation state, consent/authorization reference, and links to scans. Validate imports and clearly report rejected or ambiguous values. Start with synthetic/de-identified fixtures, not live hospital data.

### P1 — Close the scan-to-3D gap

Implement a NIfTI mask importer and preserve image orientation, voxel spacing, and physical coordinates during rendering. Define mapping between segmentation labels, atlas concepts, and EDBODY organ IDs. Add quality-review status and keep the segmentation distinct from a physiological model. Test on suitable de-identified scans with an expert reviewer before claiming reconstruction quality.

### P1 — Keep the illustrative glucose curve clearly separate from validated models

The existing equation in `src/lib/simulation.ts` is a UI placeholder. Do not calibrate or describe it as validated physiology without independent scientific evidence. Add a model-adapter contract before integrating a candidate model: version, intended use, units, parameters, input requirements, assumptions, validation evidence, uncertainty methods, and known limitations.

### P2 — Add experiment provenance and controlled version history

Each experiment should reference an immutable input snapshot (or governed snapshot identifier), model/version/configuration, units, assumptions, random seeds where relevant, timestamp, results, validation state, and supporting evidence. Apply data-retention rules and access controls. Avoid copying sensitive data into logs.

### P2 — Add reproducible comparisons after one model is validated

Implement a scenario comparison UI only after there is a suitable validated model. Comparisons should show the same model version and time horizon across scenarios, differences from baseline, model/data limitations, and uncertainty where estimable. Refuse unsupported predictions.

## Recommended milestone order

1. **Baseline verification:** run the desktop app and complete the smoke checklist.
2. **Patient-data foundation:** define/import a versioned schema with data-quality and provenance checks, using synthetic/de-identified examples.
3. **Baseline assessment:** provide a reproducible summary of available measurements, trends, and missing data without unsupported diagnosis.
4. **Prediction selection:** rank candidate tasks by high-quality data availability, feasibility, relevance, external validation datasets, and risk.
5. **One validated prediction:** evaluate against independent data with pre-defined error metrics and uncertainty reporting; only then expose it as a validated capability within its stated scope.
6. **Scan-to-3D integration:** render reviewed patient-specific segmentations in correct physical coordinates.
7. **Institutional readiness:** add approved hosting, access controls, audit, consent, governance and integration workflows before hospital use.

## Explicit limits of this audit

- I reviewed remote source files and GitHub Actions metadata; I did not run EDBODY on the user's computer.
- Passing CI confirms build/package jobs, not that the installer launches correctly or that optional atlas/segmentation integrations work with local dependencies.
- No physiological model's accuracy, clinical validity, or patient-specific predictive performance was evaluated here.
- This document is an engineering assessment, not a clinical, privacy-law, or regulatory certification.
