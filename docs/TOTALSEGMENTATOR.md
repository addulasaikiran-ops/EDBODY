# TotalSegmentator integration in EDBODY

## What was adopted

EDBODY integrates with the installed TotalSegmentator command-line interface instead of copying or bundling its source code. The app provides a local workflow to select one CT or MRI scan, choose an output folder, run the upstream segmentation command, stream console output, cancel a run, and report where the segmentation files were written.

Upstream repository: https://github.com/kosmv/TotalSegmentator

The current adapter uses only the standard tasks documented by the upstream README:

- CT: `TotalSegmentator -i <input> -o <output> --fast` (the `--fast` flag can be switched off).
- MRI: `TotalSegmentator -i <input> -o <output> --task total_mr --fast` (the `--fast` flag can be switched off).

Input may be a NIfTI file (`.nii` or `.nii.gz`), a ZIP containing DICOM slices, or a folder containing one scan's DICOM slices. Outputs are NIfTI segmentation masks in a new `EDBODY_Segmentation_*` subfolder. The current EDBODY 3D viewer does **not** yet load those masks as 3D meshes; outputs should be inspected with an appropriate medical-imaging viewer until that adapter is implemented.

## Installation

1. Install a compatible Python environment and PyTorch version using the instructions on the [upstream TotalSegmentator README](https://github.com/kosmv/TotalSegmentator#installation). The upstream README states Python >= 3.9 and PyTorch >= 2.0.0 and < 2.6.0 (with a stricter upper bound for Windows).
2. Install TotalSegmentator in that same environment: `python -m pip install TotalSegmentator`.
3. Check the terminal command works: `TotalSegmentator --help`.
4. Start or restart EDBODY from a terminal/environment where the command is on `PATH`.

If the command is not named `TotalSegmentator` (or `TotalSegmentator.exe` on Windows), set `EDBODY_TOTALSEGMENTATOR_CMD` to the full executable path before starting EDBODY. This variable is the executable path only, not a command plus arguments.

The first segmentation may download model weights and can take substantial time or memory. The `Fast mode` option is recommended for initial local testing, especially on CPU. Model files are managed by the upstream package, not by EDBODY.

## Licensing and use restrictions

- The inspected upstream repository declares Apache-2.0 for its code.
- Its README lists the default `total` and `total_mr` tasks as openly available for any usage, while listing some advanced subtasks as requiring a license. EDBODY deliberately does not expose those separately licensed subtasks in this integration.
- This does not automatically settle the licenses or terms of every pretrained weight, underlying dataset, downstream model, or clinical use case. Review the current upstream terms and relevant asset/model licenses before commercial deployment.
- The upstream README says TotalSegmentator is **not a medical device and is not intended for clinical usage**. This integration is a research workflow, not a diagnosis or treatment feature.

EDBODY should initially be tested with de-identified scans. Scan files and output masks remain on the local machine in this integration; EDBODY has not implemented encrypted patient-data storage, access controls, audit history, consent management, model validation, or clinical deployment safeguards.

## Next engineering step

Add a dedicated mask importer for the generated NIfTI files, convert each labelled volume into a mesh or volume rendering with preserved physical spacing/orientation, map labels to the viewer's organ registry, and provide explicit quality-review controls. Do not infer that a segmentation is correct without human review and task-specific validation. The patient-specific shape should also not be presented as a functional physiology model.
