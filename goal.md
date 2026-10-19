# EDBODY — Product Goal and Long-Term Vision

**Project:** EDBODY  
**Product form:** Installable desktop research platform, with institution-hosted services and patient-facing access added as the product matures  
**Initial market:** India, followed by international expansion  
**Planning approach:** Milestone-driven; no fixed deadline

## 1. Mission

EDBODY aims to become a scientifically grounded, personalized whole-body digital-twin platform. It should combine an individual's health information and, when available and appropriate, medical imaging with connected physiological models so doctors and medical researchers can investigate how that person's body might respond to food, medicines, treatments, exercise, sleep, and other interventions.

The long-term goal is not merely a 3D anatomy viewer. It is a virtual research environment in which personalized anatomy, physiological calculations, simulation results, evidence, and uncertainty are connected and traceable.

EDBODY is a research and engineering ambition—not currently a validated medical product. Predictions must not be presented as clinical facts unless their specific intended use is adequately supported by validation evidence and any required approvals.

## 2. Primary users and intended progression

### Initial users
- **Medical researchers** testing hypotheses and exploring virtual experiments.
- **Doctors** studying possible patient responses, initially in research workflows and later through appropriately validated decision support.

### Broader users over time
- Hospitals, medical colleges, universities, biomedical engineering laboratories, and research institutions.
- Patients, through a controlled portal to view approved information, contribute updated data, and manage permissions where applicable.

EDBODY should begin with research and progress toward clinical decision support only when each capability has evidence appropriate to its intended use. Patient care decisions remain under qualified clinical oversight; an experimental digital twin must not be treated as a substitute for clinical judgment.

## 3. Whole-body digital-twin vision

The long-term twin should combine:

1. **Personalized anatomy:** patient-specific structures reconstructed from suitable CT/MRI or other medical imaging when available and clinically appropriate.
2. **Personalized health state:** structured health records, laboratory results, medical history, medications, relevant measurements, and wearable data.
3. **Connected physiology:** models of organ systems and interactions, developed and validated in manageable modules.
4. **Multiple biological scales:** eventually connect molecules, cells, tissues, organs, and whole-body behavior where the evidence, data, and computing methods support it.
5. **Temporal updates:** incorporate new patient data over time, with data-quality checks, provenance, controlled model updates, and traceable history.

An anatomical reference atlas is not a patient's anatomy, and anatomy alone is not a functional physiology model. EDBODY should label these distinctions clearly.

## 4. Virtual experiments

The long-term platform should support all of the following:
- Food and nutrition experiments.
- Medicine and drug-effect research.
- Comparison of possible treatment strategies.
- Exercise, sleep, and other lifestyle interventions.
- Single-intervention experiments and combined-intervention scenarios.
- Short- and long-term simulation horizons, from minutes and hours through days, weeks, months, and years, where scientifically justified.
- Individual patient twins and population-level digital-twin simulations.

Start by testing one intervention at a time where feasible. Study combinations only when relevant interactions are represented by suitable models and are adequately supported. Population-level simulations can help explore group patterns and generate hypotheses; individual-level models can then examine specific questions, subject to their own data and validation limits.

EDBODY should support user-directed experiments and AI-recommended experiments. Autonomous exploration must be confined to controlled research environments with safeguards, auditability, and human oversight.

## 5. Simulation outputs and scientific traceability

For every supported experiment, EDBODY should provide:

- Quantitative predictions and charts with explicit units and time horizons.
- Interactive 3D visualizations linked to actual model outputs, rather than decorative or invented biological effects.
- Scientific explanations of assumptions, mechanisms, and supporting evidence.
- Detailed uncertainty reporting where it can be estimated reliably, including prediction intervals, measured errors, data limitations, and validation evidence.
- Clear distinctions between observed patient measurements, calculated assessments, exploratory estimates, and validated predictions.
- Side-by-side scenario comparison as well as individual experiments, once appropriate model capabilities exist.

If required patient data or adequate scientific evidence is missing, EDBODY should refuse to produce an unsupported prediction and explain what data or evidence is needed. It should not invent confidence or imply that a prediction is reliable merely because a numerical result can be calculated.

Every experiment should have a complete scientific record, subject to permissions and retention rules. Record at minimum:
- Input-data snapshot or governed snapshot identifier and source/provenance.
- Model identity and version, configuration, assumptions, parameter values, units, and time horizon.
- Timestamp, outputs, validation status, known limitations, uncertainty information, and evidence references.
- Reproducibility information, including random seeds when applicable.
- Links to the relevant patient-twin version and prior experiment records without unnecessarily duplicating sensitive data.

Preserve version history for clinically or scientifically meaningful twin updates so authorized users can understand and reproduce prior analyses, subject to consent, retention limits, and institutional governance.

## 6. Patient data and governance

EDBODY should use complementary data sources:
- Published medical research datasets and appropriately licensed public data.
- Hospital, medical-college, university, and research-institution partnerships.
- Patient-contributed data provided with suitable consent and authorization.

Each simulation should specify what inputs it requires and identify what is missing. Patient data should be structured with clear units, timestamps, source, provenance, quality state, and missingness rather than treated as an undifferentiated file collection.

### Hosting and security
The preferred institutional deployment is on secure hospital or research-institution servers under the institution's controls. The architecture may use local processing or other infrastructure where appropriate, but access and data handling must follow documented governance.

Before any real patient-data deployment, EDBODY must establish appropriate safeguards, including:
- Explicit and informed patient consent, defined research permissions, de-identification where appropriate, and institutional ethics review.
- Authentication and role-based access controls for doctors, researchers, administrators, and patients.
- Encryption, secure data transfer, audit logs, and controls on exports and sharing.
- Retention, deletion, and consent-withdrawal processes where applicable.
- Data minimization, privacy review, and institutional approval for research workflows.

Patient and professional experiences should be connected but have different permissions. Patients may view approved information, contribute data, and manage permissions where applicable. Doctors and researchers receive role-appropriate tools and must only access information they are authorized to use.

## 7. Scientific and technical approach

EDBODY should use a **hybrid architecture**:
- Mechanistic and physiological models represent established biological processes.
- AI can help characterize patterns, personalize parameters, and support research discovery when supported by suitable data.
- AI outputs and mechanistic simulations must be evaluated as a combined system; a hybrid design does not automatically establish accuracy.

Use appropriate existing scientific models first when their purpose, evidence, assumptions, licensing, and technical requirements fit. Collaborate with medical colleges, hospitals, and biomedical/AI research groups to adapt and validate models. Develop new EDBODY-specific models where important gaps remain.

The model architecture should be modular. Each model adapter should specify its intended use, supported population, required inputs, units, assumptions, version, outputs, validation evidence, uncertainty approach, and known limitations. Models must not be represented as interchangeable or universally valid.

Researchers should have:
- Built-in models for workflows supported by their evidence.
- A controlled research sandbox for creating, modifying, and testing custom models.
- Clear labels for experimental models.
- Internal scientific review, independent external validation, institutional approval, and applicable regulatory review before a custom model is used clinically.

The 3D anatomy view, physiological simulations, charts, and written reports should stay linked to the same patient state, model version, time horizon, and evidence record.

## 8. First prototype goal

The first prototype should connect three stages:

1. **Unified patient profile:** securely organize available records, laboratory results, medical history, scans, and relevant measurements, with source information and clear data-quality status.
2. **Personalized baseline assessment:** summarize supported health indicators, trends, and missing information without unsupported diagnostic claims.
3. **One carefully scoped prediction:** select the first prediction based on high-quality data availability, feasibility, relevance, and validation evidence—not based on which body system looks most impressive.

The first prediction should only be enabled if a suitable model and sufficient evidence are available. Otherwise, the prototype should still demonstrate the patient profile and baseline assessment while clearly marking prediction capability as not ready.

Potential prediction targets should be compared on their available datasets, model maturity, intended research use, measurable outcomes, error metrics, uncertainty estimates, and risks. No body system is preselected.

## 9. Milestone-driven roadmap

Progress should depend on demonstrated functionality, scientific readiness, and available resources rather than a fixed deadline.

### Milestone 1 — Verify and stabilize the existing desktop prototype
- Launch the app and smoke-test its screens and main workflows.
- Test atlas installation/loading and segmentation states where dependencies are available.
- Add automated tests and repeatable runtime checks in addition to packaging CI.
- Document working behavior and known failures.

### Milestone 2 — Build the patient-data foundation
- Define a versioned patient/measurement schema.
- Support controlled manual imports first, with units, timestamps, provenance, missing-data checks, and validation messages.
- Use synthetic or appropriately de-identified test data.
- Implement privacy and security controls before enabling real patient records.

### Milestone 3 — Create the baseline assessment
- Produce repeatable summaries of available measurements and trends.
- Explain data gaps, source quality, and limitations.
- Preserve meaningful profile versions and provenance.

### Milestone 4 — Select and validate one prediction
- Review candidate existing models and research datasets.
- Define a test protocol, independent evaluation data, metrics, and uncertainty reporting before evaluating the model.
- Keep the prediction experimental until the evidence supports its stated use.

### Milestone 5 — Complete patient-specific anatomy rendering
- Import segmentation masks from imaging workflows.
- Preserve physical spacing and image orientation.
- Render patient-specific anatomy in 3D and map labels to EDBODY's structure registry.
- Include quality-review controls and do not equate segmentation with physiological prediction.

### Milestone 6 — Connect models, experiments, and 3D visualization
- Link quantitative model outputs to charts and appropriate 3D effects.
- Add single-experiment and scenario-comparison workflows.
- Save reproducible scientific experiment records.
- Expand organ-system and multi-scale coverage only when suitable models are available and validated.

### Milestone 7 — Prepare for institutional research and clinical use
- Establish secure institution-hosted deployment, consent and access workflows, auditing, retention policies, and approved research governance.
- Add standardized hospital integrations after manual import workflows are stable.
- Evaluate custom models independently and complete institutional and applicable regulatory review before clinical use.

## 10. Collaboration and operating model

The project is currently being led largely by one person, with a need to recruit technical, medical, and research collaborators. The intended first partnership is multidisciplinary:
- A medical college or university for clinical and academic research expertise.
- A hospital for clinical workflow understanding and appropriately authorized data partnerships.
- An AI or biomedical engineering laboratory for computational models, infrastructure, and engineering.

The project lead intends to contribute across product direction, hands-on software development, learning the underlying science, research planning, and collaboration. Learning should combine advanced concept study, structured tutorials, and practical work directly on EDBODY.

## 11. Launch and sustainability

- **Initial market:** India, with international expansion later.
- **Long-term deployment:** pilot with one suitable partner institution, then expand to multiple institutions as governance, integration, and evidence permit.
- **Funding model:** a combination of institutional subscriptions, enterprise licensing/deployment, and grants or research partnerships.
- **Open/proprietary strategy:** share selected scientific methods, reproducibility tools, and models openly while retaining selected proprietary platform capabilities. Honor third-party licenses, attribution, and data-use terms.

## 12. Non-negotiable principles

1. **No unsupported predictions.**
2. **Research first; clinical use only when evidence and applicable approvals support the specific intended use.**
3. **Keep observed measurements distinct from simulated outputs.**
4. **Expose assumptions, uncertainty, missing data, validation evidence, and limitations.**
5. **Protect patient consent, privacy, and institutional governance.**
6. **Keep experiments reproducible and traceable.**
7. **Do not confuse generic reference anatomy or segmentation masks with a validated physiological digital twin.**
8. **Prefer evidence-based milestones over feature count or a fixed deadline.**

## 13. Current prototype status — important distinction

This document states the **goal**, not a claim that these capabilities already exist.

At the time this goal was written, the repository contains an Electron/React/TypeScript desktop UI, a schematic 3D anatomy viewer, an optional BodyParts3D reference atlas integration, a TotalSegmentator adapter that writes NIfTI masks, a session-only demo health profile, and an illustrative meal-response curve. The patient scan masks are not yet loaded into the 3D viewer; secure persistent patient records and consent/access/audit controls are not implemented; and the application has no validated clinical physiological model.

The current build workflow has successfully packaged the desktop app on Windows, macOS, and Linux. Runtime behavior and scientific validity still require testing. Real patient data must not be entered into the current demo profile.
