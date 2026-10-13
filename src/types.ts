export type Screen = 'overview' | 'twin' | 'simulations' | 'profile' | 'models';
export type OrganId = 'cardiovascular'|'respiratory'|'digestive'|'hepatic'|'endocrine'|'renal'|'nervous'|'musculoskeletal'|'immune'|'integumentary'|'reproductive';
export interface HealthProfile { name: string; age: number; heightCm: number; weightKg: number; baselineGlucose: number; hba1c: number; restingHeartRate: number; systolicBP: number; diastolicBP: number; }
export interface SimulationInput { carbsGrams: number; mealGi: number; baselineGlucose: number; activityLevel: number; durationMinutes: number; }
export interface SimulationPoint { minute: number; glucose: number; }
export interface SimulationResult { points: SimulationPoint[]; peakGlucose: number; peakMinute: number; endGlucose: number; baselineGlucose: number; disclaimer: string; }
declare global { interface Window { edbodyDesktop?: { platform: string; version: string; shell: string; }; } }