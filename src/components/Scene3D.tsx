import React, { useMemo, Suspense, useState, useRef, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { ArcballControls, Environment, Center, OrthographicCamera, PerspectiveCamera, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { InstancedAtoms } from './canvas/InstancedAtoms';
import { InstancedBonds } from './canvas/InstancedBonds';
import { UnitCell } from './canvas/UnitCell';
import { SelectionBox } from './canvas/SelectionBox';
import { useStore, updateTempAtomPositionFast, resetTempAtomPositions, tempAtomPositions } from '../store/useStore';
import { getStableFileId } from '../utils/fileId';

const isValidLatticeVectors = (vectors: any): vectors is number[][] =>
  Array.isArray(vectors) &&
  vectors.length === 3 &&
  vectors.every((v: any) => Array.isArray(v) && v.length === 3 && v.every((n: any) => typeof n === 'number' && Number.isFinite(n)));

const ExportHandler = () => {
  const { 
    uploadedFiles,
    setUploadedFile,
    setCurrentFileIndex,
    setMolecularData,
    triggerSquareExport, 
    setTriggerSquareExport,
    triggerBatchExport,
    setTriggerBatchExport,
    setIsBatchExporting,
    setBatchProgress,
    triggerVideoExport,
    setTriggerVideoExport,
    videoExportFPS,
    videoExportMode,
    setIsVideoExporting,
    molecularData,
    setTrajectoryFrame,
    toggleTrajectoryPlay,
    setVideoExportProgress,
    deductExport,
    videoExportStep,
    user,
    restoreSnapshot,
    saveSnapshot
  } = useStore();
  const { gl, scene, camera, controls } = useThree();

  const getFileId = (file: File) => getStableFileId(file);

  useEffect(() => {
    // Shared Export Logic
    const captureHighResSquare = async (wysiwyg: boolean = false) => {
        // [修复 1] 强制更新整个场景的矩阵世界，确保原子位置已计算
        scene.updateMatrixWorld(true);

        const originalPosition = camera.position.clone();
        const originalQuaternion = camera.quaternion.clone();
        const originalZoom = (camera as any).zoom;
        const originalLookAt = new THREE.Vector3();
        camera.getWorldDirection(originalLookAt);
        
        const originalSize = new THREE.Vector2();
        gl.getSize(originalSize);
        const originalPixelRatio = gl.getPixelRatio();
        const originalClearColor = new THREE.Color();
        gl.getClearColor(originalClearColor);
        const originalClearAlpha = gl.getClearAlpha();

        let targetWidth = 4096;
        let targetHeight = 4096;
        let finalRequiredSize = 0;
        let finalCenter = new THREE.Vector3();

        if (!wysiwyg) {
            // 1. Calculate Bounding Box (Auto-Fit Unit Cell) - For Batch/Square Export
            const box = new THREE.Box3();
            const currentData = useStore.getState().molecularData;
            if (currentData && currentData.atoms.length > 0) {
                currentData.atoms.forEach(atom => {
                    box.expandByPoint(new THREE.Vector3(atom.position.x, atom.position.y, atom.position.z));
                });
                box.expandByScalar(2.0);
            } else {
                scene.traverse((object) => {
                  if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
                     if (object.visible) {
                        if (object.geometry && !object.geometry.boundingBox) object.geometry.computeBoundingBox();
                        box.expandByObject(object);
                     }
                  }
                });
            }

            if (box.isEmpty()) return null;
            box.getCenter(finalCenter);
            const sphere = new THREE.Sphere();
            box.getBoundingSphere(sphere);
            finalRequiredSize = sphere.radius * 2 * 1.2;

            // Adjust Camera for Square Export
            if (controls) (controls as any).enabled = false;
            const distance = 500;
            const newPos = finalCenter.clone().sub(originalLookAt.normalize().multiplyScalar(distance));
            camera.position.copy(newPos);
            camera.lookAt(finalCenter);
        } else {
            // WYSIWYG Mode - Match current screen aspect ratio
            const aspect = originalSize.x / originalSize.y;
            targetHeight = Math.round(targetWidth / aspect);
        }

        // 3. Set High-Res Size
        gl.setSize(targetWidth, targetHeight, false);
        gl.setPixelRatio(1); 
        // 显式设置清除色为透明，确保背景透明
        gl.setClearColor(0x000000, 0);

        if (!wysiwyg) {
            // Square Export Specific Camera Adjustments
            const orthoCam = camera as THREE.OrthographicCamera;
            const halfSize = finalRequiredSize / 2;
            
            // Save original ortho params if needed
            const origLeft = orthoCam.left;
            const origRight = orthoCam.right;
            const origTop = orthoCam.top;
            const origBottom = orthoCam.bottom;
            
            orthoCam.left = -halfSize;
            orthoCam.right = halfSize;
            orthoCam.top = halfSize;
            orthoCam.bottom = -halfSize;
            orthoCam.zoom = 1;
            camera.updateProjectionMatrix();

            gl.render(scene, camera);
            gl.render(scene, camera);
            const dataUrl = gl.domElement.toDataURL('image/png', 1.0);

            // Restore
            orthoCam.left = origLeft;
            orthoCam.right = origRight;
            orthoCam.top = origTop;
            orthoCam.bottom = origBottom;
            orthoCam.zoom = originalZoom;
            camera.position.copy(originalPosition);
            camera.quaternion.copy(originalQuaternion);
            camera.updateProjectionMatrix();
            if (controls) (controls as any).enabled = true;
            
            gl.setSize(originalSize.x, originalSize.y);
            gl.setPixelRatio(originalPixelRatio);
            gl.setClearColor(originalClearColor, originalClearAlpha);
            return dataUrl;
        } else {
            // WYSIWYG Export
            camera.updateProjectionMatrix();
            
            // Render twice to ensure buffer is ready
            gl.render(scene, camera);
            gl.render(scene, camera);
            
            const dataUrl = gl.domElement.toDataURL('image/png', 1.0);
            
            // Restore
            gl.setSize(originalSize.x, originalSize.y);
            gl.setPixelRatio(originalPixelRatio);
            gl.setClearColor(originalClearColor, originalClearAlpha);
            camera.updateProjectionMatrix();
            
            return dataUrl;
        }
    };

    if (triggerSquareExport) {
       captureHighResSquare(true).then(async (dataUrl) => {
         if (dataUrl) {
            const link = document.createElement('a');
            link.download = `SCI_Square_${Date.now()}.png`;
            link.href = dataUrl;
            link.click();
            await deductExport('img');
         }
         setTriggerSquareExport(false);
       });
    }

    if (triggerBatchExport) {
         // Batch Export Logic
         const runBatch = async () => {
              setTriggerBatchExport(false);
              setIsBatchExporting(true);
              
              const JSZip = (await import('jszip')).default;
              const zip = new JSZip();
             
             const state = useStore.getState();
             const currentFiles = state.uploadedFiles;
             const currentIndex = state.currentFileIndex;
             const originalUploadedFile = state.uploadedFile;
             const originalMolecularData = state.molecularData;
             
             if (currentFiles[currentIndex]) {
                 const fileId = await getFileId(currentFiles[currentIndex]);
                 saveSnapshot(fileId);
             }
             
             const originalFileIndex = currentIndex;
             const filesToProcess = state.uploadedFiles;

             for (let i = 0; i < filesToProcess.length; i++) {
                const file = filesToProcess[i];
                setBatchProgress(`Processing ${i + 1}/${filesToProcess.length}...`);
                
                try {
                    // Load File
                    setUploadedFile(file);
                    setCurrentFileIndex(i);
                    
                    // Parse
                    const { parseVASPFile } = await import('../utils/fileParser');
                    const data = await parseVASPFile(file);
                    setMolecularData(data);
                    
                    // Restore Snapshot
                    const fileId = await getFileId(file);
                    restoreSnapshot(fileId);
                    
                    // [修复 4] 分段等待策略，确保 React 渲染和 GPU 上传都完成
                    // 1. 等待 React 组件挂载和 Hooks 计算
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // 2. 动态等待 GPU 上传（大文件等待更久）
                    const waitTime = file.size > 1024 * 1024 ? 2500 : 1500;
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    
                    // Capture
                    const dataUrl = await captureHighResSquare();
                    if (dataUrl) {
                        const success = await deductExport('img');
                        const isSVIP = user?.tier === 'svip';
                        
                        if (!success && !isSVIP) {
                            alert(`Batch export interrupted: Insufficient quota at image ${i + 1}.`);
                            break;
                        }
                        
                        const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
                        const fileName = file.name.replace(/\.[^/.]+$/, "") + "_Square.png";
                        zip.file(fileName, base64Data, { base64: true });
                        
                        setBatchProgress(`Processing ${i + 1}/${filesToProcess.length} (Consumed: ${i + 1})...`);
                    }
                } catch (err) {
                    console.error(`Error processing file ${file.name}`, err);
                }
             }
             
             // Restore original file selection
             if (originalUploadedFile && Number.isFinite(originalFileIndex) && originalFileIndex >= 0) {
                 setUploadedFile(originalUploadedFile);
                 setCurrentFileIndex(originalFileIndex);
             }
             if (originalMolecularData) {
                 setMolecularData(originalMolecularData);
                 if (originalUploadedFile) {
                     restoreSnapshot(await getFileId(originalUploadedFile));
                 }
             }
             
             setBatchProgress('Zipping...');
             const content = await zip.generateAsync({ type: "blob" });
             const { saveAs } = await import('file-saver');
             saveAs(content, `SCI_Batch_Square_${Date.now()}.zip`);
             
             setIsBatchExporting(false);
             setBatchProgress('');
        };
        
        runBatch();
    }
    
    if (triggerVideoExport && molecularData?.trajectory) {
          const runVideoExport = async () => {
               const originalFrame = molecularData.trajectory.currentFrame;
               const originalIsPlaying = molecularData.trajectory.isPlaying;
               setIsVideoExporting(true);
               setTriggerVideoExport(false);
               setVideoExportProgress(0);
               toggleTrajectoryPlay(false);
               
               const originalSize = new THREE.Vector2();
               gl.getSize(originalSize);
               const originalPixelRatio = gl.getPixelRatio();
               
               const targetWidth = 2560; // 2K for better compatibility
               const aspect = originalSize.x / originalSize.y;
               const targetHeight = Math.round(targetWidth / aspect);
               
               const exportScaleFactor = videoExportStep > 1 ? 0.75 : 1.0;
               const finalWidth = Math.round(targetWidth * exportScaleFactor);
               const finalHeight = Math.round(targetHeight * exportScaleFactor);

               gl.setSize(finalWidth, finalHeight, false);
               gl.setPixelRatio(1);
               
               camera.updateProjectionMatrix();
               
               try {
                   if (videoExportMode === 'local') {
                       const Mp4Muxer = await import('mp4-muxer');
                       
                       const muxer = new Mp4Muxer.Muxer({
                           target: new Mp4Muxer.ArrayBufferTarget(),
                           video: {
                               codec: 'avc',
                               width: finalWidth,
                               height: finalHeight
                           },
                           fastStart: 'in-memory'
                       });

                       const videoEncoder = new VideoEncoder({
                           output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
                           error: (e) => console.error(e)
                       });

                       videoEncoder.configure({
                           codec: 'avc1.4d002a',
                           width: finalWidth,
                           height: finalHeight,
                           bitrate: videoExportStep > 1 ? 30_000_000 : 50_000_000,
                           framerate: videoExportFPS
                       });

                       const totalFrames = molecularData.trajectory.totalFrames;
                       
                       let capturedFrameCount = 0;
                       for (let i = 0; i < totalFrames; i += videoExportStep) {
                           setTrajectoryFrame(i);
                           setVideoExportProgress(Math.round((i / totalFrames) * 100));
                           
                           gl.render(scene, camera);
                           
                           const delay = videoExportStep > 1 ? 0 : 50;
                           await new Promise(resolve => setTimeout(resolve, delay));
                           
                           const timestamp = (capturedFrameCount * 1000000) / videoExportFPS;
                           
                           const frame = new VideoFrame(gl.domElement, {
                               timestamp: timestamp,
                               duration: 1000000 / videoExportFPS
                           });
                           
                           const keyFrame = capturedFrameCount % 30 === 0;
                           videoEncoder.encode(frame, { keyFrame });
                           frame.close();
                           capturedFrameCount++;
                       }

                       await videoEncoder.flush();
                       muxer.finalize();

                       const { buffer } = muxer.target;
                       const blob = new Blob([buffer], { type: 'video/mp4' });
                       
                       const { saveAs } = await import('file-saver');
                       saveAs(blob, `VASP_Trajectory_${Date.now()}.mp4`);
                   } else {
                       // Cloud Export Logic
                       const JSZip = (await import('jszip')).default;
                       const zip = new JSZip();
                       const totalFrames = molecularData.trajectory.totalFrames;

                       for (let i = 0; i < totalFrames; i += videoExportStep) {
                           setTrajectoryFrame(i);
                           setVideoExportProgress(Math.round((i / totalFrames) * 100));
                           
                           gl.render(scene, camera);
                           
                           const blob = await new Promise<Blob | null>(resolve => gl.domElement.toBlob(resolve, 'image/jpeg', 0.9));
                           if (blob) {
                               zip.file(`${Math.floor(i / videoExportStep)}.jpg`, blob);
                           }
                           
                           const delay = videoExportStep > 1 ? 0 : 30;
                           await new Promise(resolve => setTimeout(resolve, delay));
                       }

                       setBatchProgress('Uploading to Cloud Server...');
                       const zipBlob = await zip.generateAsync({ type: 'blob' });
                       
                       const formData = new FormData();
                       formData.append('framesZip', zipBlob);
                       formData.append('fps', videoExportFPS.toString());

                       const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000/api' : '/api';
                       const response = await fetch(`${API_BASE_URL}/video/stitch`, {
                           method: 'POST',
                           body: formData
                       });

                       if (response.ok) {
                           const videoBlob = await response.blob();
                           const { saveAs } = await import('file-saver');
                           saveAs(videoBlob, `VASP_Trajectory_Cloud_${Date.now()}.mp4`);
                       } else {
                           const errorData = await response.json();
                           throw new Error(errorData.error || 'Cloud encoding failed');
                       }
                   }

               } catch (err) {
                   console.error("Video Export failed", err);
                   alert(`Video Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
               }
               
               gl.setSize(originalSize.x, originalSize.y, false);
               gl.setPixelRatio(originalPixelRatio);
               
               setIsVideoExporting(false);
               setVideoExportProgress(0);
               await deductExport('vid');
               setTrajectoryFrame(originalFrame);
               toggleTrajectoryPlay(originalIsPlaying);
          };
          
          runVideoExport();
      }
   }, [triggerSquareExport, triggerBatchExport, triggerVideoExport, gl, scene, camera, controls, setTriggerSquareExport, setTriggerBatchExport, uploadedFiles, setUploadedFile, setCurrentFileIndex, setMolecularData, setIsBatchExporting, setBatchProgress, setTriggerVideoExport, setIsVideoExporting, videoExportFPS, molecularData, setTrajectoryFrame, setVideoExportProgress, videoExportStep, user]);

  return null;
};

const CameraController = () => {
  const { cameraView, molecularData, currentCameraState, setCurrentCameraState, rotationTrigger } = useStore();
  const { camera, controls } = useThree();

  useEffect(() => {
      if (rotationTrigger && controls) {
          const arcball = controls as any;
          const target = arcball.target || new THREE.Vector3(0, 0, 0);
          
          // 通用的 3D 向量旋转算法：围绕目标点的 Y 轴旋转
          // 这种方法不依赖于控制器的特定 API，适用于所有控制器
          const offset = camera.position.clone().sub(target);
          const axis = new THREE.Vector3(0, 1, 0);
          offset.applyAxisAngle(axis, rotationTrigger.angle);
          
          camera.position.copy(target.clone().add(offset));
          camera.lookAt(target);
          arcball.update();
      }
  }, [rotationTrigger, controls, camera]);

  useEffect(() => {
      if (!controls) return;
      const orbit = controls as any;
      const onEnd = () => {
          if (setCurrentCameraState) {
              setCurrentCameraState({
                  position: camera.position.clone(),
                  target: orbit.target.clone()
              });
          }
      };
      orbit.addEventListener('end', onEnd);
      return () => orbit.removeEventListener('end', onEnd);
  }, [controls, camera, setCurrentCameraState]);

   useEffect(() => {
       if (!currentCameraState || !controls) return;
       const orbit = controls as any;
       const targetPos = new THREE.Vector3(currentCameraState.position.x, currentCameraState.position.y, currentCameraState.position.z);
       const targetTarget = new THREE.Vector3(currentCameraState.target.x, currentCameraState.target.y, currentCameraState.target.z);
       if (camera.position.distanceTo(targetPos) < 0.01 && orbit.target.distanceTo(targetTarget) < 0.01) return;
       camera.position.copy(targetPos);
       orbit.target.copy(targetTarget);
       orbit.update();
   }, [currentCameraState, camera, controls]);

  useEffect(() => {
    if (!camera || !controls || currentCameraState) return;
    const distance = 40;
    const target = new THREE.Vector3(0, 0, 0); 
    const setView = (pos: THREE.Vector3) => {
        const orbit = controls as any;
        orbit.autoRotate = false;
        orbit.enableDamping = false;
        orbit.target.copy(target);
        camera.up.set(0, 1, 0);
        camera.position.copy(pos);
        camera.lookAt(target);
        orbit.update();
        orbit.enableDamping = true; 
    };
    switch (cameraView) {
      case 'top': setView(new THREE.Vector3(0, distance, 0)); break;
      case 'bottom': setView(new THREE.Vector3(0, -distance, 0)); break;
      case 'left': setView(new THREE.Vector3(-distance, 0, 0)); break;
      case 'right': setView(new THREE.Vector3(distance, 0, 0)); break;
      case 'front': setView(new THREE.Vector3(0, 0, distance)); break;
      case 'back': setView(new THREE.Vector3(0, 0, -distance)); break;
      default: break;
    }
  }, [cameraView, camera, controls, molecularData, currentCameraState]); 
  return null;
};

const TrajectoryController = () => {
  const { molecularData, setTrajectoryFrame } = useStore();
  useEffect(() => {
    if (!molecularData || !molecularData.trajectory || !molecularData.trajectory.isPlaying) return;
    let lastTime = 0;
    const targetFPS = 24;
    const interval = 1000 / targetFPS;
    let animationFrameId: number;
    const animate = (time: number) => {
        if (time - lastTime > interval) {
             const { currentFrame, totalFrames } = molecularData.trajectory!;
             const nextFrame = (currentFrame + 1) % totalFrames;
             setTrajectoryFrame(nextFrame);
             lastTime = time;
        }
        animationFrameId = requestAnimationFrame(animate);
    };
    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [molecularData?.trajectory?.isPlaying, molecularData?.trajectory?.totalFrames]); 
  return null;
};

const InteractiveScene = () => {
  const {
    molecularData,
    styleConfig,
    showUnitCell,
    showBonds,
    materialStyle,
    stickRadius,
    selectedAtomIds,
    updateAtomPosition,
    tidySurface,
    toggleSelectedAtomId,
    setIsDraggingAtom,
    isBoxSelecting,
    setIsBoxSelecting,
    isBoxSelectionMode,
    setCameraView,
    cameraView,
    setMeasurementInfo,
    measurementInfo
  } = useStore();
  
  const { camera, raycaster, gl, scene } = useThree();
  const orbitControlsRef = useRef<any>(null);
  const groupRef = useRef<THREE.Group>(null);
  const [isShiftDown, setIsShiftDown] = useState(false);

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Shift') setIsShiftDown(true); };
      const handleKeyUp = (e: KeyboardEvent) => { if (e.key === 'Shift') setIsShiftDown(false); };
      const handleBlur = () => setIsShiftDown(false);
      const handleVisibility = () => { if (document.visibilityState !== 'visible') setIsShiftDown(false); };
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      window.addEventListener('blur', handleBlur);
      document.addEventListener('visibilitychange', handleVisibility);
      return () => {
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('keyup', handleKeyUp);
          window.removeEventListener('blur', handleBlur);
          document.removeEventListener('visibilitychange', handleVisibility);
      };
  }, []);

  const [dragState, setDragState] = useState<{
      active: boolean;
      atomId: string | null;
      startPoint: THREE.Vector3 | null;
      startMouse: THREE.Vector2 | null;
      initialAtomPos: THREE.Vector3 | null;
      planeNormal: THREE.Vector3 | null;
      planeConstant: number | null;
      wasSelected?: boolean;
  }>({
      active: false, atomId: null, startPoint: null, startMouse: null, initialAtomPos: null, planeNormal: null, planeConstant: null, wasSelected: false
  });

  const initialAtoms = useMemo(() => {
    if (!molecularData) return [];
    const resultAtoms = [];
    const matrixWithLatticeColumns = new THREE.Matrix3();
    if (isValidLatticeVectors(molecularData.latticeVectors)) {
        const [v1, v2, v3] = molecularData.latticeVectors;
        matrixWithLatticeColumns.set(v1[0], v2[0], v3[0], v1[1], v2[1], v3[1], v1[2], v2[2], v3[2]);
    } else {
        matrixWithLatticeColumns.identity();
    }
    const inverseMatrix = matrixWithLatticeColumns.clone().invert();

    for (const atom of molecularData.atoms) {
        const pos = new THREE.Vector3(atom.position.x, atom.position.y, atom.position.z);
        const frac = pos.clone().applyMatrix3(inverseMatrix);
        const wrap = (x: number) => {
            let v = x % 1.0;
            if (v < 0) v += 1.0;
            if (v > 0.99999) v = 0.0;
            return v;
        };
        const u = wrap(frac.x);
        const v = wrap(frac.y);
        const w = wrap(frac.z);
        const wrappedFrac = new THREE.Vector3(u, v, w);
        const wrappedCart = wrappedFrac.clone().applyMatrix3(matrixWithLatticeColumns);
        
        resultAtoms.push({
            ...atom,
            position: { x: wrappedCart.x, y: wrappedCart.y, z: wrappedCart.z }
        });

        if (tidySurface) {
             const shiftsX = [0]; const shiftsY = [0]; const shiftsZ = [0]; const THRESHOLD = 0.05; 
             if (u < THRESHOLD) shiftsX.push(1); if (v < THRESHOLD) shiftsY.push(1);
             for (const sx of shiftsX) {
                 for (const sy of shiftsY) {
                     for (const sz of shiftsZ) {
                         if (sx === 0 && sy === 0 && sz === 0) continue; 
                         const newU = u + sx; const newV = v + sy; const newW = w + sz;
                         const ghostFrac = new THREE.Vector3(newU, newV, newW);
                         const ghostCart = ghostFrac.applyMatrix3(matrixWithLatticeColumns);
                         resultAtoms.push({
                             ...atom,
                             id: `${atom.id}-ghost-${sx}-${sy}-${sz}`,
                             position: { x: ghostCart.x, y: ghostCart.y, z: ghostCart.z },
                         });
                     }
                 }
             }
        }
    }
    return resultAtoms;
  }, [molecularData?.atoms, molecularData?.latticeVectors, tidySurface, molecularData?.trajectory]);

  const currentAtoms = useMemo(() => {
    if (!molecularData) return [];
    let currentAtomsList = molecularData.atoms;
    if (molecularData.trajectory && molecularData.trajectory.frames) {
        const { frames, currentFrame } = molecularData.trajectory;
        if (frames[currentFrame]) {
            const frameData = frames[currentFrame];
            currentAtomsList = molecularData.atoms.map(atom => {
                const parts = atom.id.split('-');
                const originalIndex = parseInt(parts[1]);
                if (!isNaN(originalIndex) && (originalIndex * 3 + 2) < frameData.length) {
                    return {
                        ...atom,
                        position: { x: frameData[originalIndex * 3 + 0], y: frameData[originalIndex * 3 + 1], z: frameData[originalIndex * 3 + 2] }
                    };
                }
                return atom;
            });
        }
    }
    const resultAtoms = [];
    const matrixWithLatticeColumns = new THREE.Matrix3();
    if (isValidLatticeVectors(molecularData.latticeVectors)) {
        const [v1, v2, v3] = molecularData.latticeVectors;
        matrixWithLatticeColumns.set(v1[0], v2[0], v3[0], v1[1], v2[1], v3[1], v1[2], v2[2], v3[2]);
    } else {
        matrixWithLatticeColumns.identity();
    }
    const inverseMatrix = matrixWithLatticeColumns.clone().invert();

    for (const atom of currentAtomsList) {
        const pos = new THREE.Vector3(atom.position.x, atom.position.y, atom.position.z);
        const frac = pos.clone().applyMatrix3(inverseMatrix);
        const wrap = (x: number) => {
            let v = x % 1.0; if (v < 0) v += 1.0; if (v > 0.99999) v = 0.0; return v;
        };
        const u = wrap(frac.x); const v = wrap(frac.y); const w = wrap(frac.z);
        const wrappedFrac = new THREE.Vector3(u, v, w);
        const wrappedCart = wrappedFrac.clone().applyMatrix3(matrixWithLatticeColumns);
        resultAtoms.push({ ...atom, position: { x: wrappedCart.x, y: wrappedCart.y, z: wrappedCart.z } });

        if (tidySurface) {
             const shiftsX = [0]; const shiftsY = [0]; const shiftsZ = [0]; const THRESHOLD = 0.05; 
             if (u < THRESHOLD) shiftsX.push(1); if (v < THRESHOLD) shiftsY.push(1);
             for (const sx of shiftsX) {
                 for (const sy of shiftsY) {
                     for (const sz of shiftsZ) {
                         if (sx === 0 && sy === 0 && sz === 0) continue; 
                         const newU = u + sx; const newV = v + sy; const newW = w + sz;
                         const ghostFrac = new THREE.Vector3(newU, newV, newW);
                         const ghostCart = ghostFrac.applyMatrix3(matrixWithLatticeColumns);
                         resultAtoms.push({ ...atom, id: `${atom.id}-ghost-${sx}-${sy}-${sz}`, position: { x: ghostCart.x, y: ghostCart.y, z: ghostCart.z } });
                     }
                 }
             }
        }
    }
    return resultAtoms;
  }, [molecularData?.atoms, molecularData?.latticeVectors, tidySurface, molecularData?.trajectory, molecularData?.trajectory?.currentFrame]);

  const atoms = currentAtoms;

  // Compute measurement info based on selected atoms
  useEffect(() => {
    if (!molecularData) { setMeasurementInfo(null); return; }
    const selIds = selectedAtomIds;
    if (selIds.length === 2) {
      const atomA = atoms.find(a => a.id === selIds[0]);
      const atomB = atoms.find(a => a.id === selIds[1]);
      if (atomA && atomB) {
        const posA = new THREE.Vector3(atomA.position.x, atomA.position.y, atomA.position.z);
        const posB = new THREE.Vector3(atomB.position.x, atomB.position.y, atomB.position.z);
        const dist = posA.distanceTo(posB);
        setMeasurementInfo({ type: 'bond', value: dist, labelA: atomA.element, labelB: atomB.element });
      }
    } else if (selIds.length === 3) {
      const atomA = atoms.find(a => a.id === selIds[0]);
      const atomB = atoms.find(a => a.id === selIds[1]);
      const atomC = atoms.find(a => a.id === selIds[2]);
      if (atomA && atomB && atomC) {
        // Angle at atomB (B is the vertex)
        const posA = new THREE.Vector3(atomA.position.x, atomA.position.y, atomA.position.z);
        const posB = new THREE.Vector3(atomB.position.x, atomB.position.y, atomB.position.z);
        const posC = new THREE.Vector3(atomC.position.x, atomC.position.y, atomC.position.z);
        const vBA = posA.clone().sub(posB).normalize();
        const vBC = posC.clone().sub(posB).normalize();
        const cosAngle = Math.max(-1, Math.min(1, vBA.dot(vBC)));
        const angle = (Math.acos(cosAngle) * 180) / Math.PI;
        setMeasurementInfo({ type: 'angle', value: angle, labelA: atomA.element, labelB: atomB.element, labelC: atomC.element });
      }
    } else if (selIds.length !== 2 && selIds.length !== 3) {
      // Clear only if it's not a bond-click measurement
      if (measurementInfo?.type !== 'bond-click') {
        setMeasurementInfo(null);
      }
    }
  }, [selectedAtomIds, atoms, molecularData]);

  const handleBondClick = (bondInfo: { elementA: string; elementB: string; distance: number }) => {
    setMeasurementInfo({ type: 'bond-click', value: bondInfo.distance, labelA: bondInfo.elementA, labelB: bondInfo.elementB });
  };

  // Interaction Logic 
   const handleAtomPointerDown = (e: any, atom: any) => {
       if (orbitControlsRef.current) orbitControlsRef.current.enabled = false;
       if (e.target && e.target.setPointerCapture) e.target.setPointerCapture(e.pointerId);
       setIsDraggingAtom(true);
      
      const atomId = atom.id;
      const hitPoint = e.point.clone();
      let atomPos = new THREE.Vector3();
      if (e.object && e.instanceId !== undefined) {
           const matrix = new THREE.Matrix4();
           e.object.getMatrixAt(e.instanceId, matrix);
           atomPos.setFromMatrixPosition(matrix);
      } else {
           atomPos.copy(atom.position);
      }

      const isMultiSelect = e.shiftKey || e.ctrlKey || e.metaKey;
      const isSelected = selectedAtomIds.includes(atomId);
      const wasSelected = isSelected;
      
      if (!isSelected) {
          if (!isMultiSelect) toggleSelectedAtomId(atomId, false);
          else toggleSelectedAtomId(atomId, true);
      }
      
      const normal = new THREE.Vector3();
      camera.getWorldDirection(normal);
      normal.normalize();
      
      setDragState({
          active: true, atomId: atomId, startPoint: hitPoint, startMouse: new THREE.Vector2(e.clientX, e.clientY), initialAtomPos: atomPos, planeNormal: normal, planeConstant: normal.dot(hitPoint), wasSelected: wasSelected
      });
  };

  useEffect(() => {
      const handlePointerMove = (e: PointerEvent) => {
          if (!dragState.active || !dragState.atomId || !dragState.planeNormal || !dragState.startPoint || !dragState.initialAtomPos || dragState.planeConstant === null) return;
          const rect = gl.domElement.getBoundingClientRect();
          const mouse = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
          raycaster.setFromCamera(mouse, camera);
          const ray = raycaster.ray;
          const normal = dragState.planeNormal;
          const constant = dragState.planeConstant;
          const denominator = normal.dot(ray.direction);
          if (Math.abs(denominator) > 0.0001) {
              const t = (constant - normal.dot(ray.origin)) / denominator;
              const intersectionPoint = ray.origin.clone().add(ray.direction.clone().multiplyScalar(t));
              const delta = intersectionPoint.clone().sub(dragState.startPoint);
              const newPos = dragState.initialAtomPos.clone().add(delta);
              updateTempAtomPositionFast(dragState.atomId, { x: newPos.x, y: newPos.y, z: newPos.z });
          }
      };
      
      const handlePointerUp = (e: PointerEvent) => {
          if (dragState.active) {
              const atomId = dragState.atomId;
              if (atomId) {
                  const tempPos = tempAtomPositions.get(atomId);
                  if (tempPos) {
                      updateAtomPosition(atomId, tempPos);
                  }
              }
              resetTempAtomPositions();
              const canvasEl = gl.domElement;
              if (canvasEl && canvasEl.releasePointerCapture) { try { canvasEl.releasePointerCapture(e.pointerId); } catch (err) {} }
              if (dragState.startMouse) {
                  const dist = dragState.startMouse.distanceTo(new THREE.Vector2(e.clientX, e.clientY));
                  if (dist < 3) {
                      const isMultiSelect = e.shiftKey || e.ctrlKey || e.metaKey;
                      if (dragState.wasSelected) {
                          if (isMultiSelect) { if (atomId) toggleSelectedAtomId(atomId, true); } 
                          else { if (atomId && selectedAtomIds.length > 1) toggleSelectedAtomId(atomId, false); }
                      }
                  }
              }
              setDragState(prev => ({ ...prev, active: false, atomId: null, startMouse: null }));
              setIsDraggingAtom(false);
              if (orbitControlsRef.current) orbitControlsRef.current.enabled = true;
          }
      };
      
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      return () => {
          window.removeEventListener('pointermove', handlePointerMove);
          window.removeEventListener('pointerup', handlePointerUp);
      };
  }, [dragState, gl, camera, scene, selectedAtomIds, setIsDraggingAtom, toggleSelectedAtomId, updateAtomPosition]);

  return (
    <>
        <group ref={groupRef}>
            <InstancedAtoms atoms={atoms} onAtomPointerDown={handleAtomPointerDown} />
            {showBonds && <InstancedBonds atoms={atoms} onBondClick={handleBondClick} />}
            {showUnitCell && molecularData && isValidLatticeVectors(molecularData.latticeVectors) && <UnitCell vectors={molecularData.latticeVectors} />}
            <SelectionBox atoms={atoms} groupRef={groupRef} />
        </group>
        <ArcballControls 
            makeDefault 
            ref={orbitControlsRef} 
            enableAnimations={false}
            enabled={!isShiftDown && !dragState.active && !isBoxSelecting && !isBoxSelectionMode} 
            onStart={() => { if (cameraView !== 'default') { setCameraView('default'); } }} 
        />
    </>
  );
};

const Tooltip = () => {
  const { hoveredAtom } = useStore();
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => { setPos({ x: e.clientX, y: e.clientY }); };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);
  if (!hoveredAtom) return null;
  return (
    <div className="fixed pointer-events-none bg-black/80 text-white px-3 py-2 rounded text-xs z-50 backdrop-blur-sm border border-white/20 shadow-xl" style={{ left: pos.x + 15, top: pos.y + 15, transform: 'translate(0, 0)' }}>
      <div className="font-bold mb-0.5 text-blue-300">Atom Info</div>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <span className="text-gray-400">Element:</span><span className="font-mono">{hoveredAtom.element}</span>
        <span className="text-gray-400">Index:</span><span className="font-mono">{hoveredAtom.index}</span>
        <span className="text-gray-400">ID:</span><span className="font-mono opacity-70">{hoveredAtom.id}</span>
      </div>
    </div>
  );
};

import { IsosurfaceRenderer } from './canvas/IsosurfaceRenderer';
import { SelectionOverlay } from './SelectionOverlay';
import { ContextMenu } from './ContextMenu';

const MeasurementPanel: React.FC = () => {
  const { measurementInfo, setMeasurementInfo } = useStore();
  const [mousePos, setMousePos] = React.useState({ x: 0, y: 0 });

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  if (!measurementInfo || measurementInfo.value === null) return null;

  const isAngle = measurementInfo.type === 'angle';
  const isBondClick = measurementInfo.type === 'bond-click';

  let title = '';
  let content = '';
  let detail = '';

  if (isAngle) {
    title = 'Bond Angle';
    content = `${measurementInfo.value.toFixed(2)}°`;
    detail = `${measurementInfo.labelA} — ${measurementInfo.labelB} — ${measurementInfo.labelC}`;
  } else {
    title = isBondClick ? 'Bond Length' : 'Bond Length';
    content = `${measurementInfo.value.toFixed(3)} Å`;
    detail = `${measurementInfo.labelA} — ${measurementInfo.labelB}`;
  }

  // Position near mouse but keep within viewport
  const offsetX = 16;
  const offsetY = 16;
  const panelW = 200;
  const panelH = 80;
  const vpW = window.innerWidth;
  const vpH = window.innerHeight;
  let left = mousePos.x + offsetX;
  let top = mousePos.y + offsetY;
  if (left + panelW > vpW - 8) left = mousePos.x - panelW - offsetX;
  if (top + panelH > vpH - 8) top = mousePos.y - panelH - offsetY;

  return (
    <div
      className="fixed pointer-events-auto z-50"
      style={{ left, top }}
    >
      <div className="flex items-center gap-3 bg-white border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.08)] rounded-[16px] px-4 py-3">
        <div className="flex flex-col items-start">
          <span className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">{title}</span>
          <span className="text-base font-mono font-bold leading-tight text-[#0A1128]">{content}</span>
          <span className="text-xs text-gray-500 font-mono mt-0.5">{detail}</span>
        </div>
        <button
          onClick={() => setMeasurementInfo(null)}
          className="ml-1 w-5 h-5 flex items-center justify-center text-gray-300 hover:text-gray-500 transition-colors text-sm leading-none rounded-full hover:bg-gray-100"
          title="Clear"
        >
          ×
        </button>
      </div>
    </div>
  );
};

export const Scene3D: React.FC = () => {
  const {
    molecularData, styleConfig, exportScale, showUnitCell, lightSettings, tidySurface, materialStyle, showBonds, isPerspective, triggerSquareExport, setTriggerSquareExport, volumetricData, isosurfaceLevel, isosurfaceMeshReady
  } = useStore();
  const undo = useStore(state => state.undo);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = String(e.key || '').toLowerCase();
      if (key !== 'z') return;
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName?.toLowerCase();
      if (el && (tag === 'input' || tag === 'textarea' || (el as any).isContentEditable)) return;
      e.preventDefault();
      undo();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo]);

  const isVesta = materialStyle === 'vesta';
  const lightPosition = useMemo(() => {
    const d = 10;
    switch (lightSettings.direction) {
      case 'top-left': return [-d, d, d]; case 'top-right': return [d, d, d]; case 'bottom-left': return [-d, -d, d]; case 'bottom-right': return [d, -d, d]; case 'top': return [0, d, 0]; case 'bottom': return [0, -d, 0]; default: return [d, d, d];
    }
  }, [lightSettings.direction]);

  return (
    <div className="w-full h-full relative">
      <Tooltip />
      <MeasurementPanel />
      <SelectionOverlay />
      <ContextMenu />
      <Canvas shadows flat dpr={window.devicePixelRatio * exportScale} gl={{ preserveDrawingBuffer: true, antialias: true, toneMapping: isVesta ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping, outputColorSpace: THREE.SRGBColorSpace, alpha: true, toneMappingExposure: isVesta ? 1.2 : 1.0 }} style={{ background: 'transparent' }}>
        <ExportHandler />
        <TrajectoryController />
        {isPerspective ? (
            <PerspectiveCamera makeDefault position={[20, 20, 40]} fov={50} />
        ) : (
            <OrthographicCamera makeDefault position={[20, 20, 40]} zoom={20} />
        )}
        <CameraController />
        {isVesta ? (
          <>
            <ambientLight intensity={0.6} />
            <directionalLight position={lightPosition as any} intensity={lightSettings.intensity} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0005} />
            <directionalLight position={[-10, -10, 5]} intensity={0.5} />
          </>
        ) : (
          <>
            <ambientLight intensity={1.5} />
            <directionalLight position={lightPosition as any} intensity={lightSettings.intensity} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0001} shadow-radius={2} />
            <directionalLight position={[-5, 5, -10]} intensity={0.8} />
          </>
        )}
        <Suspense fallback={null}>
          {molecularData && (
             <Center>
                {volumetricData && <IsosurfaceRenderer data={volumetricData} level={isosurfaceLevel} />}
                {(!volumetricData || isosurfaceMeshReady) && <InteractiveScene />}
             </Center>
          )}
        </Suspense>
      </Canvas>
      {!molecularData && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-5 max-w-sm text-center">
            <div className="w-16 h-16 rounded-[20px] bg-gray-100 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div>
              <p className="text-base font-semibold text-gray-700 mb-1">Upload a structure file to get started</p>
              <p className="text-xs text-gray-400 leading-relaxed">
                Supports POSCAR, CONTCAR, CIF, XYZ, and XDATCAR formats.
                <br />
                Drag & drop onto the panel, or click Browse in the sidebar.
              </p>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-gray-400 font-mono uppercase tracking-widest">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2E4A8E]" />
              Or try the Modeling Agent to generate structures from text
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
