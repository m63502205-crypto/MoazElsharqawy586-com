import React, { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface ImageLightboxModalProps {
  images: string[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
  title?: string;
}

export const ImageLightboxModal: React.FC<ImageLightboxModalProps> = ({
  images = [],
  initialIndex = 0,
  isOpen,
  onClose,
  title
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex >= 0 && initialIndex < images.length ? initialIndex : 0);
    }
  }, [isOpen, initialIndex, images.length]);

  const handleNext = useCallback(() => {
    if (images.length <= 1) return;
    setCurrentIndex(prev => (prev + 1) % images.length);
  }, [images.length]);

  const handlePrev = useCallback(() => {
    if (images.length <= 1) return;
    setCurrentIndex(prev => (prev - 1 + images.length) % images.length);
  }, [images.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      // In RTL Arabic layout: ArrowLeft moves to next image, ArrowRight moves to previous image
      if (e.key === 'ArrowLeft') handleNext();
      if (e.key === 'ArrowRight') handlePrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handleNext, handlePrev]);

  if (!isOpen || images.length === 0) return null;

  const currentImage = images[currentIndex];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-between p-3 sm:p-6 animate-in fade-in duration-200 select-none"
      onClick={onClose}
    >
      {/* Header Bar */}
      <div
        className="flex items-center justify-between text-white z-10 bg-stone-950/70 p-3 sm:px-6 rounded-2xl border border-white/10"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="bg-red-700 text-white text-xs font-black px-2.5 py-1 rounded-md shadow-xs">
            {currentIndex + 1} / {images.length}
          </span>
          {title && (
            <h3 className="text-xs sm:text-sm font-bold text-stone-200 line-clamp-1 max-w-xs sm:max-w-md">
              {title}
            </h3>
          )}
        </div>

        <button
          onClick={onClose}
          className="p-2 text-stone-300 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold"
          title="إغلاق العرض"
        >
          <X className="w-5 h-5" />
          <span className="hidden sm:inline">إغلاق</span>
        </button>
      </div>

      {/* Main Large Image Container */}
      <div
        className="relative flex-1 flex items-center justify-center my-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Previous Button (Right arrow in RTL) */}
        {images.length > 1 && (
          <button
            onClick={handlePrev}
            className="absolute right-2 sm:right-4 z-10 w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-stone-900/80 hover:bg-red-700 text-white flex items-center justify-center border border-white/20 shadow-xl transition-all hover:scale-110 cursor-pointer"
            aria-label="الصورة السابقة"
            title="الصورة السابقة (→)"
          >
            <ChevronRight className="w-7 h-7" />
          </button>
        )}

        {/* The Large Image */}
        <div className="max-w-5xl max-h-[75vh] flex items-center justify-center p-2">
          <img
            key={currentImage}
            src={currentImage}
            alt={title || `صورة ${currentIndex + 1}`}
            className="max-h-[72vh] max-w-full object-contain rounded-2xl shadow-2xl transition-all duration-200 animate-in zoom-in-95"
            referrerPolicy="no-referrer"
          />
        </div>

        {/* Next Button (Left arrow in RTL) */}
        {images.length > 1 && (
          <button
            onClick={handleNext}
            className="absolute left-2 sm:left-4 z-10 w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-stone-900/80 hover:bg-red-700 text-white flex items-center justify-center border border-white/20 shadow-xl transition-all hover:scale-110 cursor-pointer"
            aria-label="الصورة التالية"
            title="الصورة التالية (←)"
          >
            <ChevronLeft className="w-7 h-7" />
          </button>
        )}
      </div>

      {/* Bottom Thumbnail Strip */}
      {images.length > 1 && (
        <div
          className="flex items-center justify-center gap-2 overflow-x-auto py-2 px-3 bg-stone-950/70 border border-white/10 rounded-2xl max-w-3xl mx-auto z-10"
          onClick={e => e.stopPropagation()}
        >
          {images.map((img, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={`relative w-12 h-12 sm:w-16 sm:h-16 rounded-xl overflow-hidden border-2 transition-all shrink-0 cursor-pointer ${
                idx === currentIndex
                  ? 'border-red-600 scale-105 ring-2 ring-red-600/40 opacity-100'
                  : 'border-transparent opacity-50 hover:opacity-90'
              }`}
            >
              <img src={img} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
