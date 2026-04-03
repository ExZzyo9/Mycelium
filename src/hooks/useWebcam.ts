import { useRef, useEffect, useCallback, useState } from 'react';

export interface WebcamState {
  isActive: boolean;
  error: string | null;
}

export interface WebcamMotionData {
  gridW: number;
  gridH: number;
  intensity: number;
  motionMap: Float32Array; // [gx, gy, intensity] per cell
}

export function useWebcam() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const prevFrameRef = useRef<Uint8ClampedArray | null>(null);
  const motionRef = useRef<WebcamMotionData>({
    gridW: 0,
    gridH: 0,
    intensity: 0,
    motionMap: new Float32Array(0),
  });
  const rafRef = useRef<number>(0);
  const [state, setState] = useState<WebcamState>({ isActive: false, error: null });

  const GRID_SIZE = 8;

  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!video || !canvas || !ctx || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const w = canvas.width;
    const h = canvas.height;

    // Draw mirrored frame
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();

    const currentFrame = ctx.getImageData(0, 0, w, h).data;
    const prevFrame = prevFrameRef.current;

    if (prevFrame) {
      const gridW = Math.ceil(w / GRID_SIZE);
      const gridH = Math.ceil(h / GRID_SIZE);
      const mapSize = gridW * gridH * 3;
      const motionMap = new Float32Array(mapSize);
      let totalIntensity = 0;
      let cellCount = 0;

      for (let gy = 0; gy < gridH; gy++) {
        for (let gx = 0; gx < gridW; gx++) {
          let dxSum = 0, dySum = 0, intensitySum = 0;
          let count = 0;

          for (let py = 0; py < GRID_SIZE; py++) {
            for (let px = 0; px < GRID_SIZE; px++) {
              const cx = gx * GRID_SIZE + px;
              const cy = gy * GRID_SIZE + py;
              if (cx >= w || cy >= h) continue;

              const idx = (cy * w + cx) * 4;
              const prevIdx = idx;

              const curr = (currentFrame[idx] + currentFrame[idx + 1] + currentFrame[idx + 2]) / 3;
              const prev = (prevFrame[prevIdx] + prevFrame[prevIdx + 1] + prevFrame[prevIdx + 2]) / 3;
              const diff = curr - prev;

              if (Math.abs(diff) > 15) {
                dxSum += diff;
                intensitySum += Math.abs(diff);
                count++;

                // Sample neighbors for gradient
                const rightIdx = idx + 4;
                const bottomIdx = idx + w * 4;
                if (rightIdx < currentFrame.length) {
                  const r = (currentFrame[rightIdx] + currentFrame[rightIdx + 1] + currentFrame[rightIdx + 2]) / 3;
                  dySum += r - curr;
                }
                if (bottomIdx < currentFrame.length) {
                  const b = (currentFrame[bottomIdx] + currentFrame[bottomIdx + 1] + currentFrame[bottomIdx + 2]) / 3;
                  dySum += b - curr;
                }
              }
            }
          }

          const cellIdx = (gy * gridW + gx) * 3;
          if (count > 2) {
            motionMap[cellIdx] = dxSum / count;
            motionMap[cellIdx + 1] = dySum / count;
            motionMap[cellIdx + 2] = intensitySum / count / 255;
            totalIntensity += intensitySum / count / 255;
            cellCount++;
          } else {
            motionMap[cellIdx] = 0;
            motionMap[cellIdx + 1] = 0;
            motionMap[cellIdx + 2] = 0;
          }
        }
      }

      motionRef.current = {
        gridW,
        gridH,
        intensity: cellCount > 0 ? totalIntensity / cellCount : 0,
        motionMap,
      };
    }

    prevFrameRef.current = new Uint8ClampedArray(currentFrame);
    rafRef.current = requestAnimationFrame(processFrame);
  }, []);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' },
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      videoRef.current = video;

      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => {
          video.play().then(() => resolve());
        };
      });

      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Cannot get canvas context');
      canvasRef.current = canvas;
      ctxRef.current = ctx;

      prevFrameRef.current = null;
      rafRef.current = requestAnimationFrame(processFrame);

      setState({ isActive: true, error: null });
      return true;
    } catch (err) {
      setState({ isActive: false, error: (err as Error).message });
      return false;
    }
  }, [processFrame]);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    }
    videoRef.current = null;
    canvasRef.current = null;
    ctxRef.current = null;
    prevFrameRef.current = null;
    motionRef.current = { gridW: 0, gridH: 0, intensity: 0, motionMap: new Float32Array(0) };
    setState({ isActive: false, error: null });
  }, []);

  useEffect(() => {
    return () => { stop(); };
  }, [stop]);

  return { motionRef, start, stop, state };
}
