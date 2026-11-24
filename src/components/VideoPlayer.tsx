import React, { useEffect, useRef, useState } from 'react';
import {
  hasVisitorInteracted,
  onVisitorFirstInteraction,
  setExternalVideoAudioActive
} from '../utils/heroAudio';

interface VideoPlayerProps {
  url: string;
  title?: string;
  poster?: string;
  className?: string;
  autoPlay?: boolean;
  autoPlayInView?: boolean;
  muted?: boolean;
  loop?: boolean;
}

export function parseVideoUrl(url: string): { type: 'youtube' | 'facebook' | 'direct' | 'other'; embedUrl: string } {
  if (!url) return { type: 'other', embedUrl: '' };
  const trimmed = url.trim();

  // YouTube matchers
  const youtuBeMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]+)/i);
  if (youtuBeMatch && youtuBeMatch[1]) {
    return {
      type: 'youtube',
      embedUrl: `https://www.youtube.com/embed/${youtuBeMatch[1]}?rel=0`
    };
  }

  const ytWatchMatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]+)/i);
  if (ytWatchMatch && ytWatchMatch[1]) {
    return {
      type: 'youtube',
      embedUrl: `https://www.youtube.com/embed/${ytWatchMatch[1]}?rel=0`
    };
  }

  const ytShortsMatch = trimmed.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/i);
  if (ytShortsMatch && ytShortsMatch[1]) {
    return {
      type: 'youtube',
      embedUrl: `https://www.youtube.com/embed/${ytShortsMatch[1]}?rel=0`
    };
  }

  if (trimmed.includes('youtube.com/embed/')) {
    return {
      type: 'youtube',
      embedUrl: trimmed
    };
  }

  // Facebook matchers
  if (trimmed.includes('facebook.com') || trimmed.includes('fb.watch')) {
    return {
      type: 'facebook',
      embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(trimmed)}&show_text=false&autoplay=false`
    };
  }

  return {
    type: 'direct',
    embedUrl: trimmed
  };
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  url,
  title = 'فيديو',
  poster,
  className = 'w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-md',
  autoPlay = false,
  autoPlayInView = true,
  muted,
  loop = false
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [inView, setInView] = useState(false);
  const [visitorInteracted, setVisitorInteracted] = useState(() => hasVisitorInteracted());
  const userToggledMuteRef = useRef(false);

  useEffect(() => {
    const unsub = onVisitorFirstInteraction(() => {
      setVisitorInteracted(true);
    });
    return () => {
      unsub();
      setExternalVideoAudioActive(false);
    };
  }, []);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          setInView(entry.isIntersecting);
        }
      },
      { threshold: [0, 0.05] }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [url]);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.setAttribute('playsinline', '');
    vid.setAttribute('webkit-playsinline', '');

    const shouldAuto = autoPlay || autoPlayInView;
    if (!shouldAuto) return;

    if (inView && !document.hidden) {
      const allowSound = muted === false ? true : (muted !== true && visitorInteracted && !userToggledMuteRef.current);
      vid.muted = !allowSound;
      if (allowSound) {
        setExternalVideoAudioActive(true);
      }
      if (vid.paused) {
        vid.play().catch(() => {
          vid.muted = true;
          setExternalVideoAudioActive(false);
          vid.play().catch(() => {});
        });
      }
    } else if (!vid.paused) {
      vid.pause();
      setExternalVideoAudioActive(false);
    }
  }, [inView, autoPlay, autoPlayInView, muted, visitorInteracted]);

  // If visitor interacts for the first time while video is already visible, unlock sound cleanly
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || muted === true) return;
    if (visitorInteracted && inView && !userToggledMuteRef.current && vid.muted) {
      vid.muted = false;
      if (!vid.paused) {
        setExternalVideoAudioActive(true);
      }
    }
  }, [visitorInteracted, inView, muted]);

  if (!url) return null;

  const { type, embedUrl } = parseVideoUrl(url);

  if (type === 'youtube' || type === 'facebook') {
    return (
      <div ref={containerRef} className={`relative ${className}`}>
        <iframe
          src={embedUrl}
          title={title}
          className="w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <video
        ref={videoRef}
        src={url}
        controls
        playsInline
        muted={muted !== undefined ? muted : !visitorInteracted}
        loop={loop}
        preload="metadata"
        poster={poster}
        onPlay={(e) => {
          setExternalVideoAudioActive(!e.currentTarget.muted);
        }}
        onPause={() => {
          setExternalVideoAudioActive(false);
        }}
        onEnded={() => {
          setExternalVideoAudioActive(false);
        }}
        onVolumeChange={(e) => {
          if (visitorInteracted) {
            userToggledMuteRef.current = e.currentTarget.muted;
          }
          setExternalVideoAudioActive(!e.currentTarget.paused && !e.currentTarget.muted);
        }}
        className="w-full h-full object-contain bg-black"
      >
        <source src={url} type="video/mp4" />
        متصفحكم لا يدعم تشغيل هذا الفيديو مباشرة.
      </video>
    </div>
  );
};
