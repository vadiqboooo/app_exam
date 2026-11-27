import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Check, Settings2 } from 'lucide-react';
import { loadSession } from '../../api/client';

export function TrainingVideoPlayer({
  src,
  resumeSeconds = 0,
  onPlayback,
  onSave,
  onExit,
  onEnded,
}: {
  src: string;
  resumeSeconds?: number;
  onPlayback: (percent: number) => void;
  onSave: (percent: number, seconds: number) => void;
  onExit: (percent: number, seconds: number) => void;
  onEnded: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const lastSaveAt = useRef(0);
  const exitCallback = useRef(onExit);
  exitCallback.current = onExit;
  const [levels, setLevels] = useState<{ index: number; height: number }[]>([]);
  const [quality, setQuality] = useState(-1);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const save = () => {
      const player = videoRef.current;
      if (player && player.duration > 0 && player.currentTime > 0 && !player.ended)
        exitCallback.current(Math.floor(player.currentTime / player.duration * 100), Math.floor(player.currentTime));
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') save(); };
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setError('');
    setLevels([]);
    setQuality(-1);
    setQualityOpen(false);
    lastSaveAt.current = 0;
    if (!src.endsWith('.m3u8')) {
      video.src = src;
      return;
    }
    if (!Hls.isSupported()) {
      setError('Этот браузер не поддерживает потоковое видео');
      return;
    }
    const hls = new Hls({
      xhrSetup: (xhr) => {
        const token = loadSession()?.token;
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      },
    });
    hlsRef.current = hls;
    hls.on(Hls.Events.MANIFEST_PARSED, () =>
      setLevels(hls.levels.map((level, index) => ({ index, height: level.height }))),
    );
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) setError('Не удалось воспроизвести видео');
    });
    hls.loadSource(src);
    hls.attachMedia(video);
    return () => {
      hls.destroy();
      hlsRef.current = null;
      video.removeAttribute('src');
      video.load();
    };
  }, [src]);

  return (
    <div className="training-video-player">
      <div className="training-video-frame">
        <video
        ref={videoRef}
        controls
        preload="metadata"
        onLoadedMetadata={(event) => {
          const player = event.currentTarget;
          if (resumeSeconds > 0 && resumeSeconds < player.duration - 2) player.currentTime = resumeSeconds;
        }}
        onTimeUpdate={(event) => {
          const player = event.currentTarget;
          if (player.duration > 0) {
            const percent = Math.min(100, Math.floor((player.currentTime / player.duration) * 100));
            onPlayback(percent);
            if (Date.now() - lastSaveAt.current >= 5000 && player.currentTime > 0) {
              lastSaveAt.current = Date.now();
              onSave(percent, Math.floor(player.currentTime));
            }
          }
        }}
        onPause={(event) => {
          const player = event.currentTarget;
          if (player.duration > 0 && !player.ended && player.duration - player.currentTime > 1)
            onSave(Math.floor(player.currentTime / player.duration * 100), Math.floor(player.currentTime));
        }}
        onSeeked={(event) => {
          const player = event.currentTarget;
          if (player.duration > 0 && player.currentTime > 0 && player.duration - player.currentTime > 1)
            onSave(Math.floor(player.currentTime / player.duration * 100), Math.floor(player.currentTime));
        }}
        onEnded={onEnded}
        />
        {levels.length > 1 && (
          <div className="training-video-settings">
            <button type="button" className="training-video-settings-toggle" aria-label="Качество видео" aria-expanded={qualityOpen} onClick={() => setQualityOpen(!qualityOpen)}>
              <Settings2 size={17} /> {quality === -1 ? 'Авто' : `${levels.find((level) => level.index === quality)?.height}p`}
            </button>
            {qualityOpen && (
              <div className="training-video-settings-menu" role="menu" aria-label="Качество видео">
                {[{ index: -1, height: 0 }, ...levels].map((level) => (
                  <button key={level.index} type="button" role="menuitemradio" aria-checked={quality === level.index} onClick={() => {
                    setQuality(level.index);
                    if (hlsRef.current) hlsRef.current.currentLevel = level.index;
                    setQualityOpen(false);
                  }}>
                    {level.index === -1 ? 'Авто' : `${level.height}p`}
                    {quality === level.index && <Check size={15} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
