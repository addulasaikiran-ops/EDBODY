# EDBODY Baseline Verification and Smoke Test

**Purpose:** Verify the current desktop prototype behaves as documented before expanding its capabilities.

**Important:** Use synthetic or appropriately de-identified test data only. The current health profile is session-only demo state; it is not a secure patient-record system. These checks verify software behavior, not medical accuracy.

## 1. Build and automated checks

Requirements: Node.js 22.12+ and npm, matching the packaging toolchain's minimum.

From the repository root:

```sh
npm install
npm test
npm run build
```

Expected results:
- `npm test` passes the Node.js tests for the illustrative curve's basic software invariants.
- `npm run build` completes TypeScript checking and Vite production bundling.

These tests **do not validate physiology**. Passing tests must not be interpreted as evidence that the glucose curve predicts a real patient.

## 2. Launch the desktop app

```sh
npm run dev
```

Confirm the EDBODY desktop window opens. Check the terminal and renderer console for uncaught errors during the following steps.

## 3. Main navigation

- [ ] **Overview:** demo profile and workspace cards render.
- [ ] **Human Twin:** the schematic 3D model appears; rotate, zoom, select an organ, and switch available layer modes.
- [ ] **Patient-to-Twin:** page opens; scan and output-folder dialogs can be cancelled without crashing.
- [ ] **Simulations:** controls render, changing inputs works, and Run updates the illustrative chart.
- [ ] **Health Profile:** sample fields can be edited, and BMI recalculates when height or weight changes.
- [ ] **Model Registry:** registry displays the current demo/planned status and zero validated clinical models.

## 4. Demo profile and simulation

- [ ] Confirm the profile is labeled as demo/session-only.
- [ ] Change height and weight and verify BMI updates.
- [ ] Set different carbohydrate, GI, activity, and duration inputs, then run the demo.
- [ ] Verify the graph has finite values and the selected time horizon.
- [ ] Confirm the "illustrative / not validated / do not use for medical decisions" warning remains visible.
- [ ] Close and reopen the app: changes should not be assumed to persist.

## 5. TotalSegmentator integration (optional)

This section requires a compatible, separately installed TotalSegmentator environment and suitable de-identified test scan. The first run may download model weights and require substantial compute.

- [ ] If the CLI is absent, the app explains that the tool is not ready and does not crash.
- [ ] Cancel the input and output dialogs and verify cancellation is handled.
- [ ] With a suitable test scan and output directory, run an approved standard CT or MRI task and inspect console/progress output.
- [ ] Test cancellation only with non-sensitive test data.
- [ ] Verify a timestamped output folder and NIfTI masks are created when the task succeeds.
- [ ] Treat masks as outputs requiring quality review. The current app does not import them into its 3D viewer.

Do not install or execute tasks that require a separate license unless the applicable terms have been reviewed.

## 6. BodyParts3D atlas (optional)

This test requires internet access and approximately 200 MB of initial downloads, plus storage and memory for building the atlas.

- [ ] Without an installed atlas, Human Twin offers a clear way to download the optional reference atlas.
- [ ] Start the download/build and verify progress messages are displayed.
- [ ] If the download/build fails, the interface shows an error and a retry option.
- [ ] When ready, verify named meshes appear, selection works, and attribution remains visible.
- [ ] Verify the UI labels it as a generic adult reference, not patient-specific anatomy.

## 7. Result recording

For each run, note:
- Commit SHA and operating system.
- Node and npm versions.
- Commands executed and pass/fail results.
- Screens or logs for failures, with sensitive details removed.
- Whether the optional atlas and TotalSegmentator dependencies were installed.

## Scope limits

This is a repeatable smoke-test checklist, not yet an automated end-to-end Electron UI suite. The automated Node tests cover the illustrative demo computation only. They do not test the renderer, native dialogs, anatomy downloading, segmentation quality, clinical validity, privacy compliance, or patient outcomes.
