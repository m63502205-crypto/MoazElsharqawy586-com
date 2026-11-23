import React, { useRef, useState } from 'react';
import { RefreshCw, ArrowDown } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
}

const PULL_THRESHOLD = 68;
const MAX_PULL_DISTANCE = 104;

export const PullToRefresh: React.FC<PullToRefreshProps> = ({ onRefresh, children }) => {
  const startYRef = useRef<number | null>(null);
  const pullingRef = useRef(false);
  const pullDistanceRef = useRef(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isMobileViewport = () =>
    typeof window !== 'undefined' && window.innerWidth < 1024;

  const isInteractiveTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest('input, textarea, select, [role="dialog"], [data-no-ptr="true"]'));
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isRefreshing || !isMobileViewport()) return;
    if (window.scrollY > 2) return;
    if (e.touches.length !== 1) return;
    if (isInteractiveTarget(e.target)) return;

    startYRef.current = e.touches[0].clientY;
    pullingRef.current = true;
    pullDistanceRef.current = 0;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!pullingRef.current || startYRef.current === null || isRefreshing) return;
    if (window.scrollY > 2) {
      pullingRef.current = false;
      startYRef.current = null;
      pullDistanceRef.current = 0;
      setPullDistance(0);
      return;
    }
    const delta = e.touches[0].clientY - startYRef.current;
    if (delta <= 0) {
      pullDistanceRef.current = 0;
      setPullDistance(0);
      return;
    }
    // Damped pull feedback
    const damped = Math.min(MAX_PULL_DISTANCE, Math.round(delta * 0.55));
    pullDistanceRef.current = damped;
    setPullDistance(damped);
  };

  const handleTouchEnd = async () => {
    if (!pullingRef.current) return;
    pullingRef.current = false;
    startYRef.current = null;

    if (pullDistanceRef.current >= PULL_THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      pullDistanceRef.current = 52;
      setPullDistance(52);
      try {
        await Promise.resolve(onRefresh());
      } catch {
        // handled by caller
      } finally {
        setTimeout(() => {
          setIsRefreshing(false);
          pullDistanceRef.current = 0;
          setPullDistance(0);
        }, 350);
      }
    } else {
      pullDistanceRef.current = 0;
      setPullDistance(0);
    }
  };

  const readyToRelease = pullDistance >= PULL_THRESHOLD;
  const indicatorVisible = pullDistance > 6 || isRefreshing;

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className="relative flex-1 w-full max-w-full"
    >
      {indicatorVisible && (
        <div
          className="lg:hidden flex items-center justify-center overflow-hidden transition-[height] duration-150 bg-stone-100/90 border-b border-stone-200"
          style={{ height: `${isRefreshing ? 48 : pullDistance}px` }}
          aria-live="polite"
        >
          <div className="flex items-center gap-2 text-xs font-extrabold text-stone-700">
            {isRefreshing ? (
              <>
                <RefreshCw className="w-4 h-4 text-red-700 animate-spin" />
                <span>جاري تحديث البيانات...</span>
              </>
            ) : readyToRelease ? (
              <>
                <RefreshCw className="w-4 h-4 text-red-700" />
                <span>أفلت للتحديث الآن</span>
              </>
            ) : (
              <>
                <ArrowDown className="w-4 h-4 text-stone-500" />
                <span>اسحب للأسفل لتحديث المحتوى</span>
              </>
            )}
          </div>
        </div>
      )}
      {children}
    </div>
  );
};
