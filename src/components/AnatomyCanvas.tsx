import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { OrganId } from '../types';
const parts: { id: OrganId; color: number; pos: [number,number,number]; scale: [number,number,number] }[] = [
{id:'nervous',color:0x9896ff,pos:[0,2.28,.15],scale:[.33,.26,.3]},
{id:'respiratory',color:0x70bae9,pos:[-.24,.86,.26],scale:[.21,.48,.18]},
{id:'respiratory',color:0x70bae9,pos:[.24,.86,.26],scale:[.21,.48,.18]},
{id:'cardiovascular',color:0xff6c83,pos:[.045,.68,.47],scale:[.18,.2,.14]},
{id:'hepatic',color:0xd7a06b,pos:[-.22,.12,.3],scale:[.36,.18,.17]},
{id:'digestive',color:0xe9bc7d,pos:[.03,-.27,.3],scale:[.3,.22,.18]},
{id:'renal',color:0xd27a87,pos:[-.27,-.01,.05],scale:[.1,.17,.09]},
{id:'renal',color:0xd27a87,pos:[.27,-.01,.05],scale:[.1,.17,.09]},
{id:'endocrine',color:0xe8d076,pos:[0,-.1,.4],scale:[.16,.06,.08]},
{id:'musculoskeletal',color:0x79b0a1,pos:[-.28,-1.35,.08],scale:[.15,.48,.15]},
{id:'musculoskeletal',color:0x79b0a1,pos:[.28,-1.35,.08],scale:[.15,.48,.15]},
{id:'immune',color:0xc1a0ed,pos:[0,-.72,.32],scale:[.08,.11,.08]},
{id:'integumentary',color:0x829db7,pos:[0,1.44,-.05],scale:[.42,.11,.3]},
{id:'reproductive',color:0xc08dae,pos:[0,-.83,.23],scale:[.1,.11,.08]}];
export default function AnatomyCanvas({activeOrgan,onOrganSelect}:{activeOrgan:OrganId;onOrganSelect:(id:OrganId)=>void}) {
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{const host=ref.current;if(!host)return;const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(34,host.clientWidth/Math.max(host.clientHeight,1),.1,100);camera.position.set(0,.05,8.5);
 const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.setSize(host.clientWidth,host.clientHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;host.appendChild(renderer.domElement);
 scene.add(new THREE.HemisphereLight(0xb8d8f2,0x1c2836,2));const key=new THREE.DirectionalLight(0xffffff,2.3);key.position.set(3,5,4);scene.add(key);
 const group=new THREE.Group();scene.add(group);const pick:THREE.Mesh[]=[];const skin=new THREE.MeshStandardMaterial({color:0x71869a,roughness:.68,transparent:true,opacity:.63});
 const egg=(p:[number,number,number],s:[number,number,number],mat:THREE.Material=skin)=>{const m=new THREE.Mesh(new THREE.SphereGeometry(1,20,16),mat);m.position.set(...p);m.scale.set(...s);group.add(m);return m;};
 egg([0,2.23,0],[.32,.4,.3]);egg([0,1.65,0],[.15,.22,.16]);egg([0,.55,0],[.58,1,.35]);egg([0,-.48,0],[.47,.42,.31]);egg([-.66,.55,0],[.17,.74,.17]);egg([.66,.55,0],[.17,.74,.17]);egg([-.78,-.18,.01],[.13,.18,.13]);egg([.78,-.18,.01],[.13,.18,.13]);egg([-.24,-1.36,0],[.2,.7,.21]);egg([.24,-1.36,0],[.2,.7,.21]);egg([-.25,-2.25,.02],[.16,.5,.16]);egg([.25,-2.25,.02],[.16,.5,.16]);
 parts.forEach(p=>{const mat=new THREE.MeshStandardMaterial({color:p.color,roughness:.42,emissive:p.id===activeOrgan?p.color:0x101820,emissiveIntensity:p.id===activeOrgan?.28:.04,transparent:true,opacity:.93});const m=egg(p.pos,p.scale,mat);m.userData.organId=p.id;pick.push(m);});
 const grid=new THREE.GridHelper(7,24,0x365064,0x253747);grid.position.y=-2.82;(grid.material as THREE.Material).transparent=true;(grid.material as THREE.Material).opacity=.24;scene.add(grid);
 const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.enablePan=false;controls.minDistance=6;controls.maxDistance=11;controls.target.y=-.15;
 const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();const click=(e:MouseEvent)=>{const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);const hit=ray.intersectObjects(pick)[0];if(hit?.object.userData.organId)onOrganSelect(hit.object.userData.organId as OrganId);};renderer.domElement.addEventListener('click',click);
 let raf=0;const draw=()=>{raf=requestAnimationFrame(draw);controls.update();renderer.render(scene,camera);};draw();const ro=new ResizeObserver(()=>{camera.aspect=host.clientWidth/Math.max(host.clientHeight,1);camera.updateProjectionMatrix();renderer.setSize(host.clientWidth,host.clientHeight);});ro.observe(host);
 return()=>{cancelAnimationFrame(raf);ro.disconnect();renderer.domElement.removeEventListener('click',click);controls.dispose();scene.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.LineSegments){o.geometry.dispose();const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>m.dispose());}});renderer.dispose();renderer.domElement.remove();};
 },[activeOrgan,onOrganSelect]);return <div ref={ref} className="anatomy-canvas" aria-label="Interactive schematic human body"/>;}