import { useRef, useEffect, useCallback } from 'react';

export interface AudioReactiveState {
  level: number;
  bass: number;
  mid: number;
  high: number;
}

export function useAudioReactive() {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | MediaElementAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const dataRef = useRef<Uint8Array | null>(null);
  const levelRef = useRef<AudioReactiveState>({ level: 0, bass: 0, mid: 0, high: 0 });
  const rafRef = useRef<number>(0);

  const computeLevels = useCallback((dataArray: Uint8Array) => {
    const len = dataArray.length;
    const bassEnd = Math.floor(len * 0.1);
    const midEnd = Math.floor(len * 0.5);

    let bassSum = 0, midSum = 0, highSum = 0;
    for (let i = 0; i < len; i++) {
      const v = dataArray[i] / 255;
      if (i < bassEnd) bassSum += v;
      else if (i < midEnd) midSum += v;
      else highSum += v;
    }

    const bass = bassSum / bassEnd;
    const mid = midSum / (midEnd - bassEnd);
    const high = highSum / (len - midEnd);
    const level = (bass * 0.5 + mid * 0.3 + high * 0.2);

    levelRef.current = { level, bass, mid, high };
  }, []);

    const tick = useCallback(() => {
    const analyser = analyserRef.current;
    const data = dataRef.current;
    if (analyser && data) {
      analyser.getByteFrequencyData(data as Uint8Array<ArrayBuffer>);
      computeLevels(data);
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [computeLevels]);

  const startMic = useCallback(async () => {
    try {
      stopAll();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.3;
      analyserRef.current = analyser;

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;

      dataRef.current = new Uint8Array(analyser.frequencyBinCount);
      rafRef.current = requestAnimationFrame(tick);
      return true;
    } catch {
      return false;
    }
  }, [tick]);

  const startFile = useCallback(async (file: File) => {
    try {
      stopAll();
      const url = URL.createObjectURL(file);
      const audio = new Audio(url);
      audio.crossOrigin = 'anonymous';
      audioElRef.current = audio;

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.3;
      analyserRef.current = analyser;

      const source = ctx.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(ctx.destination);
      sourceRef.current = source;

      dataRef.current = new Uint8Array(analyser.frequencyBinCount);
      await audio.play();
      rafRef.current = requestAnimationFrame(tick);
      return true;
    } catch {
      return false;
    }
  }, [tick]);

  const stopAll = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current = null;
    }
    if (sourceRef.current) {
      try { sourceRef.current.disconnect(); } catch {}
      sourceRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    dataRef.current = null;
    levelRef.current = { level: 0, bass: 0, mid: 0, high: 0 };
  }, []);

  useEffect(() => {
    return () => { stopAll(); };
  }, [stopAll]);

  return { levelRef, startMic, startFile, stopAll };
}
