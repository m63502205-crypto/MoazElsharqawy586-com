import React from 'react';
import { Play, ExternalLink } from 'lucide-react';

interface VideoPlayerProps {
  url: string;
  title?: string;
  poster?: string;
  className?: string;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
}

export function parseVideoUrl(url: string): { type: 'youtube' | 'facebook' | 'direct' | 'other'; embedUrl: string } {
  if (!url) return { type: 'other', embedUrl: '' };
  const trimmed = url.trim();

  // YouTube matchers
  // 1. youtu.be/ID
  const youtuBeMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]+)/i);
  if (youtuBeMatch && youtuBeMatch[1]) {
    return {
      type: 'youtube',
      embedUrl: `https://www.youtube.com/embed/${youtuBeMatch[1]}?rel=0`
    };
  }

  // 2. youtube.com/watch?v=ID
  const ytWatchMatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]+)/i);
  if (ytWatchMatch && ytWatchMatch[1]) {
    return {
      type: 'youtube',
      embedUrl: `https://www.youtube.com/embed/${ytWatchMatch[1]}?rel=0`
    };
  }

  // 3. youtube.com/shorts/ID
  const ytShortsMatch = trimmed.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/i);
  if (ytShortsMatch && ytShortsMatch[1]) {
    return {
      type: 'youtube',
      embedUrl: `https://www.youtube.com/embed/${ytShortsMatch[1]}?rel=0`
    };
  }

  // 4. youtube.com/embed/ID
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

  // Direct MP4 / WebM or Data URL
  if (
    trimmed.startsWith('data:video/') ||
    trimmed.endsWith('.mp4') ||
    trimmed.endsWith('.webm') ||
    trimmed.endsWith('.ogg') ||
    trimmed.endsWith('.mov') ||
    trimmed.includes('/video/')
  ) {
    return {
      type: 'direct',
      embedUrl: trimmed
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
  muted = false,
  loop = false
}) => {
  if (!url) return null;

  const { type, embedUrl } = parseVideoUrl(url);

  if (type === 'youtube' || type === 'facebook') {
    return (
      <div className={`relative ${className}`}>
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
    <div className={`relative ${className}`}>
      <video
        src={url}
        controls
        playsInline
        autoPlay={autoPlay}
        muted={muted}
        loop={loop}
        poster={poster}
        className="w-full h-full object-contain bg-black"
      >
        <source src={url} type="video/mp4" />
        متصفحكم لا يدعم تشغيل هذا الفيديو مباشرة.
      </video>
    </div>
  );
};
