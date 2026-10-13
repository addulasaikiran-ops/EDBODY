import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { OrganId } from '../types';

type LayerMode = 'organs' | 'anatomy' | 'circulation';
type Vec3 = [number, number, number];
type BodyRing = { y: number; rx: number; rz: number; cx?: number };

const organColor: Record<OrganId, number> = {
  nervous: 0xaaa0ff,
  respiratory: 0x64bce6,
  cardiovascular: 0xf06f85,
  digestive: 0xe7a66d,
  hepatic: 0xd58c52,
  endocrine: 0xf0d376,
  renal: 0xc77f97,
  musculoskeletal: 0x85b9a9,
  immune: 0xc3a1ed,
  integumentary: 0x91aabd,
  reproductive: 0xc58eb9,
};
const organName: Record<OrganId, string> = {
  nervous: 'Nervous system',
  respiratory: 'Respiratory system',
  cardiovascular: 'Cardiovascular system',
  digestive: 'Digestive system',
  hepatic: 'Liver and metabolism',
  endocrine: 'Endocrine system',
  renal: 'Renal system',
  musculoskeletal: 'Musculoskeletal system',
  immune: 'Immune system',
  integumentary: 'Integumentary system',
  reproductive: 'Reproductive system',
};

function makeLoft(profile: BodyRing[], segments = 36): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  profile.forEach((ring) => {
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      positions.push((ring.cx ?? 0) + Math.cos(a) * ring.rx, ring.y, Math.sin(a) * ring.rz);
    }
  });
  for (let i = 0; i < profile.length - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * segments + j;
      const b = i * segments + (j + 1) % segments;
      const c = (i + 1) * segments + (j + 1) % segments;
      const d = (i + 1) * segments + j;
      indices.push(a, d, b, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function vector(p: Vec3): THREE.Vector3 {
  return new THREE.Vector3(p[0], p[1], p[2]);
}

function addTube(
  parent: THREE.Group,
  points: Vec3[],
  radius: number,
  material: THREE.Material,
  organId?: OrganId,
  radialSegments = 9,
): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points.map(vector));
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(24, points.length * 12), radius, radialSegments, false), material);
  if (organId) mesh.userData.organId = organId;
  parent.add(mesh);
  return mesh;
}

function addCapsule(
  parent: THREE.Group,
  start: Vec3,
  end: Vec3,
  radius: number,
  material: THREE.Material,
): THREE.Mesh {
  const a = vector(start);
  const b = vector(end);
  const direction = b.clone().sub(a);
  const length = direction.length();
  const geometry = new THREE.CapsuleGeometry(radius, Math.max(0.02, length - radius * 2), 6, 12);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(a.add(b).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  parent.add(mesh);
  return mesh;
}

export default function AnatomyCanvas({
  activeOrgan,
  onOrganSelect,
}: {
  activeOrgan: OrganId;
  onOrganSelect: (id: OrganId) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const activeOrganRef = useRef(activeOrgan);
  const onSelectRef = useRef(onOrganSelect);
  const modeRef = useRef<LayerMode>('organs');
  const [layerMode, setLayerMode] = useState<LayerMode>('organs');

  useEffect(() => { activeOrganRef.current = activeOrgan; }, [activeOrgan]);
  useEffect(() => { onSelectRef.current = onOrganSelect; }, [onOrganSelect]);
  useEffect(() => { modeRef.current = layerMode; }, [layerMode]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, Math.max(host.clientWidth, 1) / Math.max(host.clientHeight, 1), 0.1, 100);
    camera.position.set(0, 0.02, 8.4);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xc8e2f3, 0x142331, 2.05));
    const key = new THREE.DirectionalLight(0xffffff, 2.7);
    key.position.set(3.5, 4.5, 5.5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x4ccfc3, 1.25);
    rim.position.set(-3.5, 1.5, -3);
    scene.add(rim);
    const fill = new THREE.PointLight(0x477aab, 0.85, 13);
    fill.position.set(0, -1.4, 3.5);
    scene.add(fill);

    const bodyGroup = new THREE.Group();
    const organGroup = new THREE.Group();
    const skeletonGroup = new THREE.Group();
    const vesselGroup = new THREE.Group();
    scene.add(bodyGroup, organGroup, skeletonGroup, vesselGroup);

    const skinMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x8ca4b6, roughness: 0.57, metalness: 0.02,
      transparent: true, opacity: 0.075, depthWrite: false, side: THREE.DoubleSide,
      clearcoat: 0.12, clearcoatRoughness: 0.7,
    });
    const boneMaterial = new THREE.MeshStandardMaterial({ color: 0xc8d0cf, roughness: 0.64, metalness: 0.02 });
    const boneAccent = new THREE.MeshStandardMaterial({ color: 0x819eab, roughness: 0.55 });
    skinMaterial.userData.organId = 'integumentary';
    skinMaterial.userData.baseColor = 0x8ca4b6;
    boneMaterial.userData.organId = 'musculoskeletal';
    boneMaterial.userData.baseColor = 0xc8d0cf;
    boneAccent.userData.organId = 'musculoskeletal';
    boneAccent.userData.baseColor = 0x819eab;
    const arteryMaterial = new THREE.MeshStandardMaterial({ color: 0xee647a, roughness: 0.38, emissive: 0x39101a, emissiveIntensity: 0.08 });
    const veinMaterial = new THREE.MeshStandardMaterial({ color: 0x4a9ed0, roughness: 0.42, emissive: 0x0d2437, emissiveIntensity: 0.08 });
    arteryMaterial.userData.organId = 'cardiovascular';
    arteryMaterial.userData.baseColor = 0xee647a;
    veinMaterial.userData.organId = 'cardiovascular';
    veinMaterial.userData.baseColor = 0x4a9ed0;
    const organMaterials = {} as Record<OrganId, THREE.MeshStandardMaterial>;
    (Object.keys(organColor) as OrganId[]).forEach((id) => {
      organMaterials[id] = new THREE.MeshStandardMaterial({
        color: organColor[id], roughness: 0.48, metalness: 0.015,
        emissive: 0x101820, emissiveIntensity: 0.035,
        transparent: true, opacity: 0.94, depthWrite: true,
      });
      organMaterials[id].userData.organId = id;
      organMaterials[id].userData.baseColor = organColor[id];
      organMaterials[id].userData.baseOpacity = 0.94;
    });

    const selectable: THREE.Mesh[] = [];
    const addBall = (
      parent: THREE.Group,
      position: Vec3,
      scale: Vec3,
      material: THREE.Material,
      organId?: OrganId,
      rotationZ = 0,
      pickable = true,
    ): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), material);
      mesh.position.set(...position);
      mesh.scale.set(...scale);
      mesh.rotation.z = rotationZ;
      if (organId && pickable) {
        mesh.userData.organId = organId;
        selectable.push(mesh);
      }
      parent.add(mesh);
      return mesh;
    };
    const boneBetween = (start: Vec3, end: Vec3, radius: number, material = boneMaterial) =>
      addCapsule(skeletonGroup, start, end, radius, material);

    // Anatomical surface: a continuous loft gives the torso an intentional human silhouette.
    const torso = new THREE.Mesh(makeLoft([
      { y: -0.91, rx: 0.34, rz: 0.235 },
      { y: -0.72, rx: 0.39, rz: 0.255 },
      { y: -0.43, rx: 0.335, rz: 0.215 },
      { y: -0.12, rx: 0.355, rz: 0.23 },
      { y: 0.24, rx: 0.435, rz: 0.265 },
      { y: 0.67, rx: 0.49, rz: 0.28 },
      { y: 0.97, rx: 0.535, rz: 0.265 },
      { y: 1.18, rx: 0.48, rz: 0.225 },
      { y: 1.35, rx: 0.30, rz: 0.18 },
      { y: 1.44, rx: 0.19, rz: 0.15 },
    ]), skinMaterial);
    bodyGroup.add(torso);
    addBall(bodyGroup, [0, 2.26, 0], [0.292, 0.355, 0.265], skinMaterial, undefined, 0, false);
    addCapsule(bodyGroup, [0, 1.42, 0], [0, 1.76, 0], 0.155, skinMaterial);
    addBall(bodyGroup, [0, -0.82, 0], [0.39, 0.28, 0.25], skinMaterial, undefined, 0, false);

    // Shoulder, arm and hand volumes with tapered capsules and rounded joints.
    for (const side of [-1, 1]) {
      const s = side;
      addBall(bodyGroup, [s * 0.49, 1.23, 0], [0.205, 0.22, 0.205], skinMaterial, undefined, 0, false);
      addCapsule(bodyGroup, [s * 0.53, 1.20, 0], [s * 0.68, 0.56, 0.025], 0.132, skinMaterial);
      addBall(bodyGroup, [s * 0.68, 0.55, 0.02], [0.12, 0.13, 0.125], skinMaterial, undefined, 0, false);
      addCapsule(bodyGroup, [s * 0.68, 0.52, 0.02], [s * 0.76, -0.12, 0.04], 0.092, skinMaterial);
      addBall(bodyGroup, [s * 0.77, -0.21, 0.045], [0.09, 0.15, 0.075], skinMaterial, undefined, 0, false);
      addBall(bodyGroup, [s * 0.25, -0.86, 0], [0.205, 0.23, 0.205], skinMaterial, undefined, 0, false);
      addCapsule(bodyGroup, [s * 0.25, -0.91, 0], [s * 0.285, -1.73, 0.02], 0.17, skinMaterial);
      addBall(bodyGroup, [s * 0.285, -1.75, 0.02], [0.155, 0.16, 0.16], skinMaterial, undefined, 0, false);
      addCapsule(bodyGroup, [s * 0.285, -1.78, 0.02], [s * 0.30, -2.47, 0.10], 0.112, skinMaterial);
      addBall(bodyGroup, [s * 0.30, -2.53, 0.17], [0.13, 0.11, 0.25], skinMaterial, undefined, 0, false);
    }

    // Skeleton detail: vertebrae, sternum, clavicles, ribs, pelvis and long bones.
    for (let i = 0; i < 13; i++) {
      const y = 1.19 - i * 0.155;
      const size = y > 0.18 ? 0.073 : 0.088;
      addBall(skeletonGroup, [0, y, 0.015], [size, 0.06, 0.07], boneMaterial, undefined, 0, false);
      if (y > 0.18 && y < 1.12) {
        const ribIndex = Math.round((1.10 - y) / 0.135);
        if (ribIndex >= 0 && ribIndex < 7) {
          for (const side of [-1, 1]) {
            const ribY = y - 0.015;
            const x = side;
            addTube(skeletonGroup, [
              [0.025 * x, ribY + 0.01, 0.04],
              [0.20 * x, ribY + 0.075, 0.22],
              [0.36 * x, ribY + 0.035, 0.285],
              [0.405 * x, ribY - 0.07, 0.245],
            ], 0.017, boneMaterial);
          }
        }
      }
    }
    addCapsule(skeletonGroup, [0, 1.12, 0.12], [0, 0.28, 0.28], 0.025, boneAccent);
    for (const side of [-1, 1]) {
      addTube(skeletonGroup, [[0, 1.31, 0.13], [side * 0.18, 1.35, 0.16], [side * 0.40, 1.27, 0.10]], 0.028, boneMaterial);
      boneBetween([side * 0.48, 1.22, 0], [side * 0.66, 0.57, 0.02], 0.054);
      boneBetween([side * 0.68, 0.51, 0.02], [side * 0.755, -0.12, 0.04], 0.035, boneAccent);
      addBall(skeletonGroup, [side * 0.25, -0.87, 0], [0.20, 0.14, 0.17], boneMaterial, undefined, 0, false);
      boneBetween([side * 0.25, -0.94, 0], [side * 0.285, -1.73, 0.02], 0.067);
      boneBetween([side * 0.285, -1.78, 0.02], [side * 0.30, -2.46, 0.10], 0.044, boneAccent);
    }
    addTube(skeletonGroup, [[-0.34, -0.81, 0.08], [-0.22, -0.96, 0.15], [0, -1.0, 0.17], [0.22, -0.96, 0.15], [0.34, -0.81, 0.08]], 0.045, boneMaterial);

    // Skeleton geometry participates in selection only while its parent layer is visible.
    skeletonGroup.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.userData.organId = 'musculoskeletal';
        selectable.push(object);
      }
    });

    // Reusable organ shapes have one shared material per system, with real clickable meshes.
    const organBall = (id: OrganId, p: Vec3, s: Vec3, rz = 0) =>
      addBall(organGroup, p, s, organMaterials[id], id, rz, true);
    const organTube = (id: OrganId, points: Vec3[], radius: number) => {
      const mesh = addTube(organGroup, points, radius, organMaterials[id], id, 10);
      selectable.push(mesh);
      return mesh;
    };

    // Brain: paired hemispheres, cerebellum and visible surface folds.
    organBall('nervous', [-0.105, 2.32, 0.12], [0.157, 0.185, 0.148], -0.08);
    organBall('nervous', [0.105, 2.32, 0.12], [0.157, 0.185, 0.148], 0.08);
    organBall('nervous', [0, 2.205, 0.19], [0.13, 0.085, 0.095]);
    const brainGroove = new THREE.MeshStandardMaterial({ color: 0x6d69b9, roughness: 0.7 });
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const x = side * (0.055 + i * 0.032);
        addTube(organGroup, [[x, 2.42, 0.235], [x + side * 0.012, 2.37, 0.258], [x, 2.32, 0.265], [x + side * 0.01, 2.28, 0.25]], 0.006, brainGroove);
      }
    }

    // Respiratory tree and lungs with subtly separated lobes.
    organBall('respiratory', [-0.215, 0.87, 0.205], [0.175, 0.39, 0.13], -0.08);
    organBall('respiratory', [0.215, 0.87, 0.205], [0.175, 0.39, 0.13], 0.08);
    organBall('respiratory', [-0.205, 0.60, 0.236], [0.135, 0.205, 0.105], -0.12);
    organBall('respiratory', [0.235, 0.68, 0.236], [0.13, 0.23, 0.105], 0.09);
    organBall('respiratory', [0.19, 1.00, 0.22], [0.135, 0.19, 0.105], 0.06);
    organTube('respiratory', [[0, 1.32, 0.22], [0, 1.12, 0.27], [-0.03, 1.01, 0.30]], 0.045);
    organTube('respiratory', [[-0.03, 1.01, 0.30], [-0.12, 0.94, 0.30], [-0.20, 0.88, 0.28]], 0.027);
    organTube('respiratory', [[-0.03, 1.01, 0.30], [0.09, 0.95, 0.30], [0.19, 0.88, 0.28]], 0.027);

    // Heart and major vessel origins.
    organBall('cardiovascular', [0.035, 0.57, 0.315], [0.16, 0.215, 0.13], -0.20);
    organBall('cardiovascular', [-0.035, 0.64, 0.34], [0.105, 0.13, 0.11], 0.12);
    organTube('cardiovascular', [[0.08, 0.72, 0.31], [0.10, 0.90, 0.30], [0.06, 1.00, 0.26], [0.02, 1.05, 0.21]], 0.052);
    organTube('cardiovascular', [[0.10, 0.90, 0.30], [0.22, 0.98, 0.22], [0.25, 1.08, 0.18]], 0.025);

    // Liver, gallbladder, stomach and spleen.
    organBall('hepatic', [-0.19, 0.105, 0.245], [0.31, 0.165, 0.13], -0.12);
    organBall('hepatic', [-0.385, 0.14, 0.245], [0.16, 0.12, 0.112], 0.15);
    organBall('hepatic', [-0.105, -0.015, 0.30], [0.045, 0.07, 0.045]);
    organBall('digestive', [0.23, 0.04, 0.225], [0.145, 0.22, 0.105], -0.42);
    organBall('digestive', [0.31, -0.08, 0.24], [0.10, 0.12, 0.085], 0.22);
    organTube('digestive', [[0.17, 0.30, 0.26], [0.25, 0.21, 0.28], [0.29, 0.08, 0.29]], 0.038);
    organBall('digestive', [0.405, 0.06, 0.15], [0.075, 0.12, 0.075], -0.30);

    // Pancreas and a coiled small intestine / colon make the digestive anatomy read at a glance.
    organTube('endocrine', [[-0.19, -0.09, 0.24], [-0.08, -0.055, 0.285], [0.06, -0.07, 0.285], [0.21, -0.12, 0.25]], 0.043);
    organTube('digestive', [[-0.25, -0.22, 0.24], [-0.28, -0.32, 0.27], [-0.25, -0.55, 0.28], [-0.18, -0.63, 0.29], [0.02, -0.64, 0.29], [0.23, -0.60, 0.28], [0.26, -0.37, 0.27], [0.20, -0.29, 0.28], [0.09, -0.34, 0.30], [-0.03, -0.30, 0.30], [-0.14, -0.40, 0.30], [-0.12, -0.52, 0.30], [0.02, -0.54, 0.30], [0.13, -0.47, 0.30], [0.14, -0.39, 0.30], [0.04, -0.38, 0.30], [-0.035, -0.45, 0.30], [0.02, -0.48, 0.30]], 0.036);
    organTube('digestive', [[-0.28, -0.25, 0.245], [-0.32, -0.38, 0.25], [-0.31, -0.54, 0.245], [-0.22, -0.68, 0.25], [0.18, -0.68, 0.25], [0.29, -0.55, 0.245], [0.29, -0.34, 0.245]], 0.045);

    // Kidneys and ureters are placed posteriorly; the view can be rotated to inspect them.
    organBall('renal', [-0.34, -0.12, -0.045], [0.105, 0.17, 0.085], -0.24);
    organBall('renal', [0.34, -0.12, -0.045], [0.105, 0.17, 0.085], 0.24);
    organTube('renal', [[-0.34, -0.24, -0.01], [-0.30, -0.43, 0.055], [-0.20, -0.70, 0.13]], 0.018);
    organTube('renal', [[0.34, -0.24, -0.01], [0.30, -0.43, 0.055], [0.20, -0.70, 0.13]], 0.018);
    organBall('renal', [0, -0.78, 0.18], [0.12, 0.13, 0.09]);

    // Thyroid, adrenal glands, thymus and selected lymph nodes.
    organBall('endocrine', [-0.065, 1.48, 0.16], [0.075, 0.10, 0.07], -0.14);
    organBall('endocrine', [0.065, 1.48, 0.16], [0.075, 0.10, 0.07], 0.14);
    organBall('endocrine', [-0.34, 0.09, 0.055], [0.045, 0.045, 0.04]);
    organBall('endocrine', [0.34, 0.09, 0.055], [0.045, 0.045, 0.04]);
    organBall('immune', [0, 0.37, 0.17], [0.115, 0.15, 0.07]);
    for (const p of [[-0.14, -0.23, 0.19], [0.14, -0.23, 0.19], [-0.10, 0.18, 0.14], [0.10, 0.18, 0.14]] as Vec3[]) {
      organBall('immune', p, [0.035, 0.035, 0.03]);
    }

    // Neutral placeholder in the pelvis; detailed reproductive anatomy requires a person-specific model.
    organBall('reproductive', [0, -0.91, 0.12], [0.115, 0.13, 0.085]);
    organBall('reproductive', [-0.10, -0.89, 0.12], [0.07, 0.08, 0.07], -0.2);
    organBall('reproductive', [0.10, -0.89, 0.12], [0.07, 0.08, 0.07], 0.2);

    // Major circulation outside the organ meshes: arteries in coral, veins in blue.
    const artery = (points: Vec3[], radius: number) => {
      const m = addTube(vesselGroup, points, radius, arteryMaterial, 'cardiovascular', 10);
      selectable.push(m);
      return m;
    };
    const vein = (points: Vec3[], radius: number) => {
      const m = addTube(vesselGroup, points, radius, veinMaterial, 'cardiovascular', 10);
      selectable.push(m);
      return m;
    };
    artery([[0.08, 0.64, 0.38], [0.07, 0.87, 0.35], [0.03, 1.04, 0.29], [0.00, 1.22, 0.22], [0.00, 1.42, 0.18]], 0.028);
    artery([[0.04, 0.45, 0.36], [0.05, 0.10, 0.34], [0.02, -0.27, 0.32], [0.02, -0.65, 0.27], [0.07, -0.93, 0.20]], 0.035);
    artery([[0.06, -0.70, 0.25], [-0.12, -0.92, 0.20], [-0.22, -1.25, 0.17], [-0.27, -1.75, 0.14], [-0.29, -2.35, 0.13]], 0.020);
    artery([[0.06, -0.70, 0.25], [0.16, -0.92, 0.20], [0.24, -1.25, 0.17], [0.28, -1.75, 0.14], [0.30, -2.35, 0.13]], 0.020);
    artery([[0.00, 1.24, 0.20], [-0.18, 1.25, 0.15], [-0.46, 1.03, 0.12], [-0.63, 0.56, 0.10]], 0.016);
    artery([[0.00, 1.24, 0.20], [0.18, 1.25, 0.15], [0.47, 1.03, 0.12], [0.65, 0.56, 0.10]], 0.016);
    vein([[0.16, 0.63, 0.28], [0.17, 0.30, 0.24], [0.15, -0.10, 0.22], [0.13, -0.48, 0.18], [0.08, -0.87, 0.15]], 0.028);
    vein([[0.00, 1.32, 0.18], [0.00, 1.05, 0.20], [-0.02, 0.75, 0.24]], 0.021);
    vein([[-0.02, 1.03, 0.20], [-0.22, 1.00, 0.15], [-0.48, 0.80, 0.09], [-0.64, 0.45, 0.09]], 0.014);
    vein([[-0.02, 1.03, 0.20], [0.19, 1.00, 0.15], [0.48, 0.80, 0.09], [0.65, 0.45, 0.09]], 0.014);

    // A subtle laboratory floor and horizon lines give depth without competing with the anatomy.
    const grid = new THREE.GridHelper(6.2, 26, 0x355365, 0x243746);
    grid.position.y = -2.72;
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMaterials.forEach((m) => { m.transparent = true; m.opacity = 0.20; });
    scene.add(grid);
    const floorRing = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.55, 64),
      new THREE.MeshBasicMaterial({ color: 0x254958, transparent: true, opacity: 0.18, side: THREE.DoubleSide }),
    );
    floorRing.rotation.x = -Math.PI / 2;
    floorRing.position.y = -2.715;
    scene.add(floorRing);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.enablePan = false;
    controls.minDistance = 6.1;
    controls.maxDistance = 10.5;
    controls.minPolarAngle = 0.55;
    controls.maxPolarAngle = Math.PI - 0.55;
    controls.target.set(0, -0.06, 0);
    controls.update();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDown: { x: number; y: number } | null = null;
    const onPointerDown = (event: PointerEvent) => { pointerDown = { x: event.clientX, y: event.clientY }; };
    const onPointerUp = (event: PointerEvent) => {
      if (!pointerDown || Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 5) {
        pointerDown = null;
        return;
      }
      pointerDown = null;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const isVisible = (object: THREE.Object3D) => {
        let current: THREE.Object3D | null = object;
        while (current) {
          if (!current.visible) return false;
          current = current.parent;
        }
        return true;
      };
      const hit = raycaster.intersectObjects(selectable, false).find((item) =>
        item.object.userData.organId && isVisible(item.object)
      );
      const id = hit?.object.userData.organId as OrganId | undefined;
      if (id) onSelectRef.current(id);
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const allSelectableMaterials = new Set<THREE.Material>([
      ...Object.values(organMaterials),
      skinMaterial,
      boneMaterial,
      boneAccent,
      arteryMaterial,
      veinMaterial,
    ]);
    selectable.forEach((mesh) => {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => allSelectableMaterials.add(material));
    });
    const applyMode = (mode: LayerMode) => {
      skeletonGroup.visible = mode === 'anatomy';
      vesselGroup.visible = mode === 'circulation';
      skinMaterial.opacity = mode === 'organs' ? 0.075 : mode === 'anatomy' ? 0.13 : 0.035;
      organGroup.visible = true;
      (Object.keys(organMaterials) as OrganId[]).forEach((id) => {
        organMaterials[id].opacity = mode === 'circulation' && id !== 'cardiovascular'
          ? 0.16
          : mode === 'anatomy' ? 0.79 : 0.94;
      });
      arteryMaterial.opacity = 0.96;
      veinMaterial.opacity = 0.94;
      arteryMaterial.transparent = true;
      veinMaterial.transparent = true;
    };

    let previousMode: LayerMode | null = null;
    let previousActive: OrganId | null = null;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (previousMode !== modeRef.current) {
        applyMode(modeRef.current);
        previousMode = modeRef.current;
      }
      if (previousActive !== activeOrganRef.current) {
        allSelectableMaterials.forEach((material) => {
          if (material instanceof THREE.MeshStandardMaterial) {
            const id = material.userData.organId as OrganId | undefined;
            const baseColor = (material.userData.baseColor as number | undefined) ?? material.color.getHex();
            material.emissive.setHex(id === activeOrganRef.current ? baseColor : 0x101820);
            material.emissiveIntensity = id === activeOrganRef.current ? 0.28 : 0.035;
          }
        });
        previousActive = activeOrganRef.current;
      }
      controls.update();
      renderer.render(scene, camera);
    };
    applyMode(modeRef.current);
    draw();

    const resizeObserver = new ResizeObserver(() => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    resizeObserver.observe(host);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
          obj.geometry.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className="anatomy-stage" aria-label="Interactive procedural human anatomy visualization">
      <div ref={hostRef} className="anatomy-canvas" />
      <div className="anatomy-toolbar" role="group" aria-label="Anatomy display layers">
        <span>LAYERS</span>
        {([
          ['organs', 'Organs'],
          ['anatomy', 'Anatomy'],
          ['circulation', 'Circulation'],
        ] as [LayerMode, string][]).map(([mode, label]) => (
          <button key={mode} type="button" className={layerMode === mode ? 'selected' : ''} onClick={() => setLayerMode(mode)}>
            {label}
          </button>
        ))}
      </div>
      <div className="anatomy-caption">
        <span className="anatomy-live-dot" />
        <span>{organName[activeOrgan]}</span>
        <small>PROCEDURAL MODEL · NOT TO SCALE</small>
      </div>
    </div>
  );
}
