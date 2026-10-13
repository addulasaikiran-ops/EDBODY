export type Screen = 'overview' | 'twin' | 'patient-twin' | 'simulations' | 'profile' | 'models';
export type OrganId = 'cardiovascular'|'respiratory'|'digestive'|'hepatic'|'endocrine'|'renal'|'nervous'|'musculoskeletal'|'immune'|'integumentary'|'reproductive';
export interface HealthProfile { name: string; age: number; heightCm: number; weightKg: number; baselineGlucose: number; hba1c: number; restingHeartRate: number; systolicBP: number; diastolicBP: number; }
export interface SimulationInput { carbsGrams: number; mealGi: number; baselineGlucose: number; activityLevel: number; durationMinutes: number; }
export interface SimulationPoint { minute: number; glucose: number; }
export interface SimulationResult { points: SimulationPoint[]; peakGlucose: number; peakMinute: number; endGlucose: number; baselineGlucose: number; disclaimer: string; }
export interface TotalSegmentatorCheck { available: boolean; command: string; message: string; }
export interface FileSelection { cancelled: boolean; path?: string; kind?: 'file' | 'directory'; error?: string; }
export interface DirectorySelection { cancelled: boolean; path?: string; }
export interface SegmentationRunOptions { modality: 'ct' | 'mr'; fast: boolean; }
export interface SegmentationRunResult { ok: boolean; cancelled?: boolean; error?: string; details?: string; outputPath?: string; outputCount?: number; modality?: 'ct' | 'mr'; fast?: boolean; }
export interface AnatomyAtlasCounts { elements: number; concepts: number; triangles: number; vertices?: number; mirrored?: number; }
export interface AnatomyAtlasStatus { ready: boolean; dataDir?: string; name?: string; version?: string; counts?: AnatomyAtlasCounts | null; attribution?: string; license?: string; licenseUrl?: string; bytes?: number; message?: string; }
export interface AnatomyAtlasProgress { phase: string; message: string; loaded?: number; total?: number; ready?: boolean; file?: string; }
declare global {
  interface Window {
    edbodyDesktop?: {
      platform: string;
      version: string;
      shell: string;
      anatomyAtlasStatus?: () => Promise<AnatomyAtlasStatus>;
      prepareAnatomyAtlas?: () => Promise<AnatomyAtlasStatus>;
      onAnatomyAtlasProgress?: (callback: (progress: AnatomyAtlasProgress) => void) => () => void;
      checkTotalSegmentator?: () => Promise<TotalSegmentatorCheck>;
      chooseScanInput?: () => Promise<FileSelection>;
      chooseOutputDirectory?: () => Promise<DirectorySelection>;
      runTotalSegmentator?: (options: SegmentationRunOptions) => Promise<SegmentationRunResult>;
      cancelTotalSegmentator?: () => Promise<{ cancelled: boolean }>;
      onTotalSegmentatorProgress?: (callback: (message: string) => void) => () => void;
    };
  }
}
