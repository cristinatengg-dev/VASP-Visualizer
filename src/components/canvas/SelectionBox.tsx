import React, { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { useStore } from '../../store/useStore';
import * as THREE from 'three';
import { Atom } from '../../types';

// --- 1. 性能节流函数 (防止鼠标移动触发频率过高卡死浏览器) ---
const throttle = (func: Function, limit: number) => {
  let inThrottle: boolean;
  return function(this: any, ...args: any[]) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  }
};

export const SelectionBox: React.FC<{ 
  atoms?: Atom[];
  groupRef?: React.RefObject<THREE.Group>;
}> = ({ atoms, groupRef }) => {
  const { 
    setSelectedAtoms, 
    setSelectionRect, 
    isBoxSelectionMode, 
    setIsBoxSelecting,
    setContextMenu 
  } = useStore();
  
  const { gl, camera } = useThree();
  
  // 使用 Ref 存储状态，避免闭包陷阱和不必要的重绘
  const startPointRef = useRef<{ x: number, y: number } | null>(null);
  const isSelectingRef = useRef(false);
  const startedViaModeRef = useRef(false);
  const tempVec = useRef(new THREE.Vector3());
  const tempCamVec = useRef(new THREE.Vector3());
  const tempWorldVec = useRef(new THREE.Vector3());
  const tempScaleVec = useRef(new THREE.Vector3());
  const raycaster = useRef(new THREE.Raycaster());

  // --- 2. 核心逻辑：只在框选模式开启时挂载监听器 ---
  useEffect(() => {
    const canvas = gl.domElement;

    const handlePointerDown = (e: PointerEvent) => {
      // 只响应左键
      if (e.button !== 0) return;
      if (isSelectingRef.current) return;
      if (!e.shiftKey && !isBoxSelectionMode) return;
      if (e.shiftKey && useStore.getState().hoveredAtom) return;
      
      isSelectingRef.current = true;
      startedViaModeRef.current = !e.shiftKey && isBoxSelectionMode;
      startPointRef.current = { x: e.clientX, y: e.clientY };
      
      // 锁定指针，防止拖拽出窗口导致事件丢失
      canvas.setPointerCapture(e.pointerId);
      
      // 通知 Store 开始框选（用于显示 UI 覆盖层）
      useStore.getState().setIsBoxSelecting(true);
      useStore.getState().setSelectionRect({
        left: e.clientX, top: e.clientY, width: 0, height: 0
      });
    };

    // [关键优化] 使用 throttle 限制更新频率
    const handlePointerMove = throttle((e: PointerEvent) => {
      if (!isSelectingRef.current || !startPointRef.current) return;

      const currentX = e.clientX;
      const currentY = e.clientY;
      const startX = startPointRef.current.x;
      const startY = startPointRef.current.y;

      // 计算矩形参数
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);
      const left = Math.min(currentX, startX);
      const top = Math.min(currentY, startY);

      // 只更新视觉矩形，不进行复杂的原子查找
      setSelectionRect({ left, top, width, height });
    }, 30); // 30ms 间隔，足以保证流畅度且不卡顿

    const handlePointerUp = (e: PointerEvent) => {
      if (!isSelectingRef.current || !startPointRef.current) return;
      
      canvas.releasePointerCapture(e.pointerId);

      const startX = startPointRef.current.x;
      const startY = startPointRef.current.y;
      const endX = e.clientX;
      const endY = e.clientY;

      const rect = {
          left: Math.min(startX, endX),
          top: Math.min(startY, endY),
          width: Math.abs(endX - startX),
          height: Math.abs(endY - startY)
      };
      
      // --- 3. 只有在松手时才进行昂贵的 3D 投影计算 ---
      if (rect && rect.width > 2 && rect.height > 2 && atoms) {
          const selectedIds: string[] = [];
          const state = useStore.getState();
          
          // 预计算屏幕边界
          const left = rect.left;
          const right = rect.left + rect.width;
          const top = rect.top;
          const bottom = rect.top + rect.height;
          const canvasRect = canvas.getBoundingClientRect();
          const hitEpsilonPx = 1.5;

          const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

          const getWorldRadius = (atom: Atom) => {
              const baseRadius = state.globalElementSettings[atom.element]?.radius ?? atom.radius ?? 1;
              const localStyle = atom.renderStyle && atom.renderStyle !== 'default' ? atom.renderStyle : state.materialStyle;
              let scale = 1;
              if (localStyle === 'stick') scale = 0.12;
              else if (localStyle === 'vesta') scale = 0.45;
              return baseRadius * scale;
          };

          const getPixelRadius = (worldRadius: number, worldPos: THREE.Vector3) => {
              if (!Number.isFinite(worldRadius) || worldRadius <= 0) return 0;
              if ((camera as any).isPerspectiveCamera) {
                  tempCamVec.current.copy(worldPos).applyMatrix4((camera as THREE.PerspectiveCamera).matrixWorldInverse);
                  const z = Math.abs(tempCamVec.current.z);
                  if (!Number.isFinite(z) || z <= 1e-6) return 0;
                  const fovRad = THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov);
                  const pxPerUnit = canvasRect.height / (2 * Math.tan(fovRad / 2) * z);
                  return worldRadius * pxPerUnit;
              }
              if ((camera as any).isOrthographicCamera) {
                  const cam = camera as THREE.OrthographicCamera;
                  const viewHeight = Math.abs(cam.top - cam.bottom);
                  if (!Number.isFinite(viewHeight) || viewHeight <= 1e-6) return 0;
                  const pxPerUnit = canvasRect.height / viewHeight;
                  return worldRadius * pxPerUnit;
              }
              return 0;
          };

          const group = groupRef?.current;
          let worldScaleFactor = 1;
          if (group) {
              group.updateWorldMatrix(true, false);
              group.getWorldScale(tempScaleVec.current);
              worldScaleFactor = Math.max(tempScaleVec.current.x, tempScaleVec.current.y, tempScaleVec.current.z);
              if (!Number.isFinite(worldScaleFactor) || worldScaleFactor <= 0) worldScaleFactor = 1;
          }

          // 批量处理原子
          for (let i = 0; i < atoms.length; i++) {
              const atom = atoms[i];
              tempWorldVec.current.set(atom.position.x, atom.position.y, atom.position.z);
              if (group) tempWorldVec.current.applyMatrix4(group.matrixWorld);
              
              // 3D 坐标转 2D 屏幕坐标 (最耗时的步骤)
              tempVec.current.copy(tempWorldVec.current).project(camera);

              if (tempVec.current.z < -1 || tempVec.current.z > 1) continue;
              const x = canvasRect.left + (tempVec.current.x * 0.5 + 0.5) * canvasRect.width;
              const y = canvasRect.top + (-(tempVec.current.y * 0.5) + 0.5) * canvasRect.height;

              const worldRadius = getWorldRadius(atom) * worldScaleFactor;
              const rPx = getPixelRadius(worldRadius, tempWorldVec.current);
              const rr = Math.max(0, rPx + hitEpsilonPx);

              const closestX = clamp(x, left, right);
              const closestY = clamp(y, top, bottom);
              const dx = x - closestX;
              const dy = y - closestY;

              if (dx * dx + dy * dy <= rr * rr) {
                  selectedIds.push(atom.id);
              }
          }
          
          if (selectedIds.length > 0) {
              if (e.ctrlKey || e.metaKey) {
                  const existing = useStore.getState().selectedAtomIds;
                  setSelectedAtoms(Array.from(new Set([...existing, ...selectedIds])));
              } else {
                  setSelectedAtoms(selectedIds);
              }
          }
      }

      // 重置状态
      isSelectingRef.current = false;
      startPointRef.current = null;
      setSelectionRect(null);
      setIsBoxSelecting(false);
      if (startedViaModeRef.current) {
          useStore.getState().setIsBoxSelectionMode(false);
      }
      startedViaModeRef.current = false;
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isBoxSelectionMode, gl, camera, atoms, setSelectedAtoms, setSelectionRect, setIsBoxSelecting]);

  // --- 4. 独立的右键菜单逻辑 (始终激活) ---
  useEffect(() => {
      const handleContextMenu = (e: MouseEvent) => {
          if (e.target !== gl.domElement) return;
          e.preventDefault(); // 阻止浏览器默认右键菜单

          // 简单的射线检测，看是否点击了空白处
          const rect = gl.domElement.getBoundingClientRect();
          const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
          );
          
          raycaster.current.setFromCamera(mouse, camera);
          // 这里的检测可以简化，只检测是否没点中任何原子
          // 由于 InstancedMesh 的检测比较复杂，这里假设如果没有 Hover 到原子，就是点在空地
          const hoveredAtom = useStore.getState().hoveredAtom;
          
          if (!hoveredAtom) {
              setContextMenu({
                  visible: true,
                  x: e.clientX,
                  y: e.clientY,
                  atomId: undefined 
              });
          }
      };

      const canvas = gl.domElement;
      canvas.addEventListener('contextmenu', handleContextMenu);
      return () => canvas.removeEventListener('contextmenu', handleContextMenu);
  }, [gl, camera, setContextMenu]);

  return null;
};
