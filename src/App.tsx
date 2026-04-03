import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Upload,
  Maximize2,
  Minimize2,
  X,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Music,
  Camera,
  Circle,
  Info,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useAudioReactive } from './hooks/useAudioReactive';
import { useWebcam } from './hooks/useWebcam';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Particle {
  x: number;
  y: number;
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  size: number;
  noiseOffset: number;
}

interface TypographySettings {
  text: string;
  fontSize: number;
  fontFamily: string;
  customFontUrl?: string;
}

interface NoiseSettings {
  jitter: number;
  returnForce: number;
  damping: number;
  repelRadius: number;
  repelStrength: number;
}

export default function App() {
  const [typography, setTypography] = useState<TypographySettings>({
    text: 'MYCELIUM',
    fontSize: 190,
    fontFamily: 'Inter, sans-serif',
  });
  const [myceliumMode, setMyceliumMode] = useState(true);

  const [noise, setNoise] = useState<NoiseSettings>({
    jitter: 50,
    returnForce: 0.08,
    damping: 0.88,
    repelRadius: 120,
    repelStrength: 8,
  });

  const [showControls, setShowControls] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [audioSource, setAudioSource] = useState<'none' | 'mic' | 'file'>('none');
  const [audioSensitivity, setAudioSensitivity] = useState(1.0);
  const [webcamInfluence, setWebcamInfluence] = useState(1.0);
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const requestRef = useRef<number>(0);

  const audio = useAudioReactive();
  const webcam = useWebcam();
  const lastSpaceTimeRef = useRef<number>(0);

  const showNotification = (msg: string) => {
    setDownloadStatus(msg);
    setTimeout(() => setDownloadStatus(null), 3500);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setRecordTime(0);
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current as any);
      recordTimerRef.current = null;
    }
  };

  const startRecording = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || isRecording) return;

    const stream = canvas.captureStream(60);
    const recordedChunks: Blob[] = [];
    recordedChunksRef.current = recordedChunks;

    let fileHandle: any = null;
    let writable: any = null;
    try {
      if ('showSaveFilePicker' in window) {
        // @ts-ignore
        fileHandle = await (window as any).showSaveFilePicker({
          suggestedName: `typography_${Date.now()}.webm`,
          types: [{ description: 'WebM video', accept: { 'video/webm': ['.webm'] } }]
        });
        writable = await fileHandle.createWritable();
      }
    } catch (e) {
      fileHandle = null;
      writable = null;
    }

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    const mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8000000 });
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) recordedChunksRef.current.push(ev.data);
    };

    mediaRecorder.onstop = async () => {
      if (recordedChunksRef.current.length === 0) {
        showNotification('Recording failed: No data captured');
        setIsRecording(false);
        return;
      }
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
      const filename = `typography_${Date.now()}.webm`;

      try {
        if (writable) {
          await writable.write(blob);
          await writable.close();
          showNotification(`Video saved to disk`);
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.style.position = 'fixed'; a.style.top = '-9999px';
          document.body.appendChild(a);
          a.click();
          setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1200);
          showNotification(`Video downloaded: ${filename}`);
        }
      } catch (err) {
        console.error(err);
        showNotification('Save failed');
      }

      recordedChunksRef.current = [];
      mediaRecorderRef.current = null;
      setIsRecording(false);
      setRecordTime(0);
      if (recordTimerRef.current) { clearInterval(recordTimerRef.current as any); recordTimerRef.current = null; }
    };

    mediaRecorder.start(100);
    setIsRecording(true);
    setRecordTime(0);

    if (recordTimerRef.current) clearInterval(recordTimerRef.current as any);
    recordTimerRef.current = setInterval(() => {
      setRecordTime(prev => prev + 1);
    }, 1000) as any;
  }, [isRecording]);

  const takeScreenshot = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    tempCtx.fillStyle = '#000000';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    tempCtx.drawImage(canvas, 0, 0);

    const filename = `typography_${Date.now()}.png`;

    try {
      if ('showSaveFilePicker' in window) {
        // @ts-ignore
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'PNG image', accept: { 'image/png': ['.png'] } }]
        });
        const writable = await handle.createWritable();
        const blob = await new Promise<Blob>((resolve) => tempCanvas.toBlob(b => resolve(b as Blob), 'image/png'));
        await writable.write(blob);
        await writable.close();
        showNotification('Screenshot saved to disk');
        return;
      }
    } catch (e) {
    }

    const dataUrl = tempCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.style.position = 'fixed'; a.style.top = '-9999px';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => document.body.removeChild(a), 1000);
    showNotification(`Screenshot downloaded: ${filename}`);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        const now = Date.now();
        if (now - lastSpaceTimeRef.current < 300 && lastSpaceTimeRef.current > 0) {
          if (isRecording) {
            stopRecording();
          } else {
            startRecording();
          }
          lastSpaceTimeRef.current = 0;
        } else {
          lastSpaceTimeRef.current = now;
        }
      } else if (e.key.toLowerCase() === 's' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        takeScreenshot();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRecording]);

  const sampleText = useCallback((w?: number, h?: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const width = w ?? canvas.width;
    const height = h ?? canvas.height;

    const offCanvas = document.createElement('canvas');
    offCanvas.width = width;
    offCanvas.height = height;
    const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
    if (!offCtx) return;

    offCtx.fillStyle = 'black';
    offCtx.fillRect(0, 0, width, height);
    offCtx.font = `900 ${typography.fontSize}px ${typography.fontFamily}`;
    offCtx.textAlign = 'center';
    offCtx.textBaseline = 'middle';
    offCtx.fillStyle = 'white';
    offCtx.fillText(typography.text, width / 2, height / 2);

    const imageData = offCtx.getImageData(0, 0, width, height);
    const pixels = imageData.data;
    const newParticles: Particle[] = [];

    const step = myceliumMode ? 4 : 6;

    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const index = (y * width + x) * 4;
        if (pixels[index] > 128) {
          newParticles.push({
            x,
            y,
            ox: x,
            oy: y,
            vx: 0,
            vy: 0,
            size: myceliumMode ? Math.random() * 1.2 + 0.6 : Math.random() * 2 + 1,
            noiseOffset: Math.random() * 1000,
          });
        }
      }
    }

    particlesRef.current = newParticles;
  }, [typography, myceliumMode]);

  const animate = useCallback((time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const t = time * 0.001;
    const { x: mx, y: my } = mouseRef.current;
    const { returnForce, damping, jitter, repelRadius, repelStrength } = noise;

    const audioLvl = audio.levelRef.current;
    const audioLevel = audioLvl.level * audioSensitivity;
    const audioBass = audioLvl.bass * audioSensitivity;

    const webcamData = webcam.motionRef.current;
    const webcamIntensity = webcamData.intensity * webcamInfluence;

    if (myceliumMode) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
    } else {
      ctx.fillStyle = 'black';
    }
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const particles = particlesRef.current;
    const cw = canvas.width;
    const ch = canvas.height;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      const mdx = mx - p.x;
      const mdy = my - p.y;
      const mDistSq = mdx * mdx + mdy * mdy;
      if (mDistSq < repelRadius * repelRadius && mDistSq > 0.01) {
        const mDist = Math.sqrt(mDistSq);
        const force = (1.0 - mDist / repelRadius) * repelStrength;
        p.vx -= (mdx / mDist) * force;
        p.vy -= (mdy / mDist) * force;
      }

      if (audioLevel > 0.01) {
        const cx = cw / 2;
        const cy = ch / 2;
        const adx = p.x - cx;
        const ady = p.y - cy;
        const aDist = Math.sqrt(adx * adx + ady * ady) + 1;
        const audioForce = audioLevel * 3 * (1 + audioBass * 2);
        p.vx += (adx / aDist) * audioForce;
        p.vy += (ady / aDist) * audioForce;

        if (audioBass > 0.1) {
          p.vx += (Math.random() - 0.5) * audioBass * 5;
          p.vy += (Math.random() - 0.5) * audioBass * 5;
        }
      }

      if (webcamIntensity > 0.01 && webcamData.gridW > 0) {
        const gridX = (p.x / cw) * webcamData.gridW;
        const gridY = (p.y / ch) * webcamData.gridH;
        const gx = Math.floor(gridX);
        const gy = Math.floor(gridY);

        if (gx >= 0 && gx < webcamData.gridW && gy >= 0 && gy < webcamData.gridH) {
          const cellIdx = (gy * webcamData.gridW + gx) * 3;
          const cellIntensity = webcamData.motionMap[cellIdx + 2];

          if (cellIntensity > 0.02) {
            const motionX = webcamData.motionMap[cellIdx] * 0.1;
            const motionY = webcamData.motionMap[cellIdx + 1] * 0.1;
            p.vx += motionX * webcamInfluence * cellIntensity * 20;
            p.vy += motionY * webcamInfluence * cellIntensity * 20;
          }
        }
      }

      p.vx += (p.ox - p.x) * returnForce;
      p.vy += (p.oy - p.y) * returnForce;

      p.vx *= damping;
      p.vy *= damping;

      const jVal = myceliumMode ? jitter * 0.015 : jitter * 0.02;
      const nx = Math.sin(t * 2.1 + p.noiseOffset) * jVal;
      const ny = Math.cos(t * 1.7 + p.noiseOffset) * jVal;
      
      let growX = 0, growY = 0;
      if (myceliumMode) {
        const growthAngle = t * 0.3 + p.noiseOffset * 0.01;
        growX = Math.cos(growthAngle) * 0.02;
        growY = Math.sin(growthAngle * 1.3) * 0.02;
      }

      p.x += p.vx + nx + growX;
      p.y += p.vy + ny + growY;

      ctx.beginPath();
      
      if (myceliumMode) {
        ctx.ellipse(p.x, p.y, p.size * 1.4, p.size * 0.6, Math.atan2(p.vy, p.vx + 0.1), 0, Math.PI * 2);
        const warmth = 210 + Math.sin(p.noiseOffset + t) * 15;
        const r = Math.min(255, warmth + (audioBass * 30));
        const g = Math.min(255, warmth - 5 + (audioLevel * 20));
        const b = Math.min(255, warmth - 25);
        const alpha = 0.65 + Math.sin(t * 1.5 + p.noiseOffset) * 0.25;
        ctx.fillStyle = audioLevel > 0.03 
          ? `rgba(${r}, ${g + 20}, ${b + 10}, ${alpha})`
          : `rgba(${warmth}, ${warmth - 10}, ${warmth - 30}, ${alpha})`;
      } else {
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        if (audioLevel > 0.05) {
          const r = 255;
          const g = Math.min(255, 200 + audioBass * 55);
          const b = Math.min(255, 180 + audioLvl.high * 75);
          ctx.fillStyle = `rgb(${r},${g},${b})`;
        } else {
          ctx.fillStyle = 'white';
        }
      }
      
      ctx.fill();
    }

    requestRef.current = requestAnimationFrame(animate);
  }, [noise, audio.levelRef, audioSensitivity, webcam.motionRef, webcamInfluence, myceliumMode]);

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
        sampleText();
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [sampleText, animate]);

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    mouseRef.current = { x: clientX, y: clientY };
  };

  const handleFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      const fontName = `CustomFont_${Date.now()}`;
      const fontFace = new FontFace(fontName, `url(${url})`);
      try {
        const loadedFont = await fontFace.load();
        document.fonts.add(loadedFont);
        setTypography(prev => ({ ...prev, fontFamily: fontName, customFontUrl: url }));
      } catch (err) {
        console.error('Font loading failed:', err);
      }
    }
  };

  const handleAudioFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const ok = await audio.startFile(file);
      if (ok) setAudioSource('file');
    }
  };

  const toggleMic = async () => {
    if (audioSource === 'mic') {
      audio.stopAll();
      setAudioSource('none');
    } else {
      const ok = await audio.startMic();
      if (ok) setAudioSource('mic');
    }
  };

  const toggleWebcam = async () => {
    if (webcam.state.isActive) {
      webcam.stop();
    } else {
      await webcam.start();
    }
  };

  return (
    <div
      className="relative w-full h-screen bg-black overflow-hidden font-sans select-none"
      onMouseMove={handleMouseMove}
      onTouchMove={handleMouseMove}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block touch-none"
      />

      <div className={cn(
        'fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-500',
        showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'
      )}>
        <div className="flex flex-wrap items-center gap-4 px-6 py-4 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl max-w-[95vw]">

          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-white/40 font-bold px-1">Content</span>
            <input
              type="text"
              value={typography.text}
              onChange={(e) => setTypography(t => ({ ...t, text: e.target.value }))}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:ring-1 focus:ring-white/30 outline-none w-32 transition-all"
            />
          </div>

          <div className="h-10 w-px bg-white/10 mx-1" />

          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-white/40 font-bold px-1">Size</span>
            <input
              type="range"
              min="40"
              max="300"
              value={typography.fontSize}
              onChange={(e) => setTypography(t => ({ ...t, fontSize: parseInt(e.target.value) }))}
              className="w-24 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-white"
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-white/40 font-bold px-1">Jitter</span>
            <input
              type="range"
              min="0"
              max="200"
              value={noise.jitter}
              onChange={(e) => setNoise(n => ({ ...n, jitter: parseInt(e.target.value) }))}
              className="w-24 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-white"
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-white/40 font-bold px-1">Repel</span>
            <input
              type="range"
              min="0"
              max="50"
              value={noise.repelStrength}
              onChange={(e) => setNoise(n => ({ ...n, repelStrength: parseInt(e.target.value) }))}
              className="w-24 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-white"
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-white/40 font-bold px-1">Texture</span>
            <button
              onClick={() => setMyceliumMode(!myceliumMode)}
              className={cn(
                'px-3 py-1.5 rounded-lg border transition-all text-xs font-medium',
                myceliumMode
                  ? 'bg-white text-black border-white'
                  : 'bg-white/10 text-white/70 border-white/10 hover:bg-white/20 hover:text-white'
              )}
            >
              {myceliumMode ? 'Mycelium' : 'Dots'}
            </button>
          </div>

          <div className="h-10 w-px bg-white/10 mx-1" />

          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-white/40 font-bold px-1">Typeface</span>
            <div className="flex items-center gap-2">
              <label className="group relative flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 rounded-lg px-3 py-1.5 cursor-pointer transition-all">
                <Upload size={14} className="text-white/70 group-hover:text-white" />
                <span className="ml-2 text-xs font-medium text-white/70 group-hover:text-white">Upload</span>
                <input type="file" accept=".otf,.ttf,.woff,.woff2" className="hidden" onChange={handleFontUpload} />
              </label>
              {typography.customFontUrl && (
                <button
                  onClick={() => setTypography(t => ({ ...t, fontFamily: 'Inter, sans-serif', customFontUrl: undefined }))}
                  className="p-1.5 hover:bg-red-500/20 text-red-400 rounded-lg transition-all"
                  title="Remove custom font"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="h-10 w-px bg-white/10 mx-1" />

          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-white/40 font-bold px-1">Sound</span>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleMic}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all text-xs font-medium',
                  audioSource === 'mic'
                    ? 'bg-white text-black border-white'
                    : 'bg-white/10 text-white/70 border-white/10 hover:bg-white/20 hover:text-white'
                )}
              >
                {audioSource === 'mic' ? <Mic size={14} /> : <MicOff size={14} />}
                Mic
              </button>
              <label className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-lg cursor-pointer transition-all text-xs font-medium text-white/70 hover:text-white">
                <Music size={14} />
                File
                <input type="file" accept="audio/*" className="hidden" onChange={handleAudioFile} />
              </label>
            </div>
            {audioSource !== 'none' && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[9px] text-white/30">Sens</span>
                <input
                  type="range"
                  min="0.1"
                  max="3"
                  step="0.1"
                  value={audioSensitivity}
                  onChange={(e) => setAudioSensitivity(parseFloat(e.target.value))}
                  className="w-20 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-white"
                />
                <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full transition-all duration-75"
                    style={{ width: `${Math.min(100, audio.levelRef.current.level * audioSensitivity * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="h-10 w-px bg-white/10 mx-1" />

          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-white/40 font-bold px-1">Camera</span>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleWebcam}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all text-xs font-medium',
                  webcam.state.isActive
                    ? 'bg-white text-black border-white'
                    : 'bg-white/10 text-white/70 border-white/10 hover:bg-white/20 hover:text-white'
                )}
              >
                {webcam.state.isActive ? <Video size={14} /> : <VideoOff size={14} />}
                Cam
              </button>
            </div>
            {webcam.state.isActive && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[9px] text-white/30">Force</span>
                <input
                  type="range"
                  min="0.1"
                  max="3"
                  step="0.1"
                  value={webcamInfluence}
                  onChange={(e) => setWebcamInfluence(parseFloat(e.target.value))}
                  className="w-20 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-white"
                />
                <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full transition-all duration-75"
                    style={{ width: `${Math.min(100, webcam.motionRef.current.intensity * webcamInfluence * 100)}%` }}
                  />
                </div>
              </div>
            )}
            {webcam.state.error && (
              <span className="text-[9px] text-red-400">{webcam.state.error}</span>
            )}
          </div>

          <div className="h-10 w-px bg-white/10 mx-1" />
          
          <div className="flex items-center gap-2">
            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all text-xs font-medium',
                isRecording
                  ? 'bg-red-500/90 text-white border-red-400 animate-pulse'
                  : 'bg-white/10 text-white/70 border-white/10 hover:bg-white/20 hover:text-white'
              )}
            >
              {isRecording ? <Circle size={14} fill="currentColor" /> : <Video size={14} />}
              {isRecording ? `● ${recordTime}s` : 'Record'}
            </button>
            
            <button
              onClick={takeScreenshot}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-white/10 text-white/70 border-white/10 hover:bg-white/20 hover:text-white transition-all text-xs font-medium"
            >
              <Camera size={14} />
              Screenshot
            </button>
          </div>
        </div>
      </div>

      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
        <button
          onClick={() => setShowInfo(true)}
          className="p-3 bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/10 rounded-full text-white/70 hover:text-white transition-all shadow-xl"
          title="About"
        >
          <Info size={20} />
        </button>
        <button
          onClick={() => setShowControls(!showControls)}
          className="p-3 bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/10 rounded-full text-white/70 hover:text-white transition-all shadow-xl"
          title={showControls ? 'Hide Controls' : 'Show Controls'}
        >
          {showControls ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
        </button>
      </div>

      {!showControls && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 text-white/20 text-[10px] uppercase tracking-[0.2em] font-bold animate-pulse pointer-events-none">
          Hover to Manipulate · Double Space to Record · S to Screenshot
        </div>
      )}
      
      {downloadStatus && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-white text-black rounded-lg shadow-lg text-sm font-medium animate-pulse">
          ✓ {downloadStatus}
        </div>
      )}

      {showInfo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={() => setShowInfo(false)}
          />
          <div className="relative max-w-2xl w-[90vw] max-h-[85vh] overflow-y-auto bg-neutral-950 border border-white/15 rounded-3xl shadow-2xl">
            <button
              onClick={() => setShowInfo(false)}
              className="absolute top-5 right-5 p-2 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-all z-10"
            >
              <X size={18} />
            </button>

            <div className="p-10">
              <h1 className="text-3xl font-black text-white tracking-tight mb-1">Mycelium</h1>
              <p className="text-white/30 text-sm font-medium tracking-wide mb-10">Reactive Particle Typography</p>

              <div className="space-y-10">

                <section>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-px bg-white/30" />
                    <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-white/50">How It Works</h2>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>
                  <div className="space-y-4 text-white/60 text-sm leading-relaxed">
                    <p>
                      Mycelium deconstructs typography into thousands of individual particles. 
                      Your text is rendered invisibly, then every pixel of each letterform is 
                      sampled and replaced by a living point — a particle bound to its origin by 
                      spring physics.
                    </p>
                    <p>
                      These particles respond to three channels of input:
                    </p>
                    <div className="grid grid-cols-1 gap-3 my-5">
                      <div className="flex gap-3 items-start bg-white/5 rounded-xl p-4 border border-white/5">
                        <span className="text-lg mt-0.5">🖱</span>
                        <div>
                          <span className="text-white/80 font-semibold text-xs uppercase tracking-wider">Mouse & Touch</span>
                          <p className="text-white/40 text-xs mt-1">Move your cursor over the text. Particles repel outward from the pointer, then spring back to reform the letters. The repel radius and force are adjustable.</p>
                        </div>
                      </div>
                      <div className="flex gap-3 items-start bg-white/5 rounded-xl p-4 border border-white/5">
                        <span className="text-lg mt-0.5">🎤</span>
                        <div>
                          <span className="text-white/80 font-semibold text-xs uppercase tracking-wider">Sound — Mic or Audio File</span>
                          <p className="text-white/40 text-xs mt-1">Enable your microphone or load an audio file. Low frequencies (bass) push particles outward from the text center and add random displacement. Louder sounds create larger bursts.</p>
                        </div>
                      </div>
                      <div className="flex gap-3 items-start bg-white/5 rounded-xl p-4 border border-white/5">
                        <span className="text-lg mt-0.5">📷</span>
                        <div>
                          <span className="text-white/80 font-semibold text-xs uppercase tracking-wider">Camera — Motion Tracking</span>
                          <p className="text-white/40 text-xs mt-1">Enable your webcam and the app tracks motion between frames. Movement in the video pushes nearby particles in the same direction — wave your hand and the letters ripple.</p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                      <span className="text-white/80 font-semibold text-xs uppercase tracking-wider">Controls</span>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-3 text-xs text-white/40">
                        <div><span className="text-white/60 font-medium">Content</span> — type any word or phrase</div>
                        <div><span className="text-white/60 font-medium">Size</span> — scale the typography</div>
                        <div><span className="text-white/60 font-medium">Jitter</span> — idle particle vibration</div>
                        <div><span className="text-white/60 font-medium">Repel</span> — mouse push strength</div>
                        <div><span className="text-white/60 font-medium">Texture</span> — switch between dots & mycelium</div>
                        <div><span className="text-white/60 font-medium">Typeface</span> — upload .otf .ttf .woff .woff2</div>
                        <div><span className="text-white/60 font-medium">Double Space</span> — start / stop recording</div>
                        <div><span className="text-white/60 font-medium">S key</span> — take screenshot</div>
                      </div>
                    </div>
                  </div>
                </section>

                <div className="h-px bg-white/10 my-8" />

                <section>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-px bg-white/30" />
                    <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-white/50">Statement</h2>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>
                  <div className="space-y-4 text-white/50 text-sm leading-relaxed italic">
                    <p>
                      Typography has always been a negotiation between intention and material — 
                      the chisel against stone, the press against paper, the pixel against glass. 
                      Mycelium proposes a fourth material: <span className="text-white/80 not-italic font-medium">the body itself.</span>
                    </p>
                    <p>
                      Here, letters are not fixed objects but living colonies — constellations of 
                      particles that hold their shape through tension, not rigidity. Each point 
                      knows where it belongs, but it can be displaced, scattered, pulled apart. 
                      It always returns. The text remembers its form the way muscle remembers 
                      movement.
                    </p>
                    <p>
                      When you move your hand before the camera, the letters flinch. When you 
                      speak, they shudder. When you hover your cursor, they part like a crowd 
                      making space. The text is no longer something you read — it is something 
                      that <span className="text-white/80 not-italic font-medium">reads you.</span>
                    </p>
                    <p>
                      The mycelium mode draws on the intelligence of fungal networks — 
                      organisms that grow without a plan, that find structure through accumulation, 
                      that communicate through chemistry and proximity. The letters become 
                      filaments: not designed but <span className="text-white/80 not-italic font-medium">grown</span>, 
                      not rendered but <span className="text-white/80 not-italic font-medium">cultured.</span>
                    </p>
                    <p>
                      This is typography as living system. A word that breathes when you breathe. 
                      A sentence that scatters when you clap. A name that dissolves under your 
                      fingertip and reforms in your absence. The message persists, but its 
                      surface is never still — like water holding a reflection.
                    </p>
                    <p className="text-white/30 not-italic text-xs mt-6">
                      Mycelium exists at the intersection of graphic design, generative art, 
                      and embodied interaction — where the viewer's presence becomes part of the composition.
                    </p>
                  </div>
                </section>

              </div>

              <div className="mt-10 pt-6 border-t border-white/10 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.15em] text-white/20 font-bold">Mycelium v1.0</span>
                <button
                  onClick={() => setShowInfo(false)}
                  className="px-5 py-2 bg-white text-black rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-white/90 transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
