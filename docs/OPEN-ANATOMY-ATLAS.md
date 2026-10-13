# Detailed anatomy atlas in EDBODY

EDBODY can optionally download and display a real mesh-based anatomical reference atlas using the BodyParts3D 4.0 dataset. The integration is adapted from the data preparation code in [Open Anatomy Atlas](https://github.com/CognitionLabSNUC/open-anatomy-atlas), whose application code is MIT licensed. The atlas assets are downloaded by the user at runtime and are not bundled in EDBODY installers.

## Use it

Open the **Human twin** view and choose **Download detailed atlas**. The first install downloads the BodyParts3D structure tables and two simplified OBJ archives (approximately 200 MB total before caching), then builds a compact binary mesh atlas in EDBODY's local application-data directory. Keep the app open during the download and build. If the step fails, try again; downloads are cached and can resume from completed files.

The viewer has low-overhead category layers and clickable structures. It can show organ/viscera meshes, skeletal and muscular meshes, or vessels. The existing procedural schematic remains the fallback when the atlas is not installed.

## What this is (and is not)

BodyParts3D is a generic adult male reference atlas. It is not the specific patient's anatomy and is not reconstructed from that patient's CT/MRI. The Patient-to-Twin TotalSegmentator workflow currently writes NIfTI masks separately; it does not yet convert those masks into meshes or load them into this view. The atlas is for visualization and navigation, not diagnosis, physiology prediction, or treatment.

## Attribution and licenses

- **Anatomical mesh data:** BodyParts3D 4.0, © The Database Center for Life Science (DBCLS), licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/). Source and terms: [DBCLS BodyParts3D](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/).
- **Adapted data-pipeline source code:** Open Anatomy Atlas, Copyright © 2026 Cognition Lab, Shiv Nadar University Chennai, and Open Anatomy Atlas contributors; MIT License. The copy of the MIT license is in [LICENSES/OPEN-ANATOMY-ATLAS-MIT.txt](../LICENSES/OPEN-ANATOMY-ATLAS-MIT.txt).
- The [Open Anatomy Atlas repository](https://github.com/CognitionLabSNUC/open-anatomy-atlas) lists Z-Anatomy as CC BY-SA 4.0 but identifies some meshes in the standard downloadable package (including inner ear and kidney models) with non-commercial terms. EDBODY deliberately downloads BodyParts3D 4.0 only, not Z-Anatomy.
- Attribution must be preserved if EDBODY redistributes BodyParts3D data. Review the upstream license and data terms before distributing the atlas pack or offering a commercial build.

The BodyParts3D atlas in EDBODY is displayed as a reference mesh set, with a persistent attribution label in the viewer. The upstream reference project also notes that the atlas represents a single adult male body and that mirrored structures are approximations.

## Provenance

Atlas preparation code is adapted from the src/data pipeline in Open Anatomy Atlas. Core source files:
- bp3d.js
- assemble.js
- graph.js
- obj.js
- zip.js
- classify.js
- pipeline-download.js

The code is kept separately under tools/anatomy-atlas with a local MIT license notice. Source repository: https://github.com/CognitionLabSNUC/open-anatomy-atlas.
