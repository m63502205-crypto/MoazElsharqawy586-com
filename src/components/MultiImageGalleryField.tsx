import React, { useState } from 'react';
import { MediaItem } from '../types';
import { MediaPickerModal } from './MediaPickerModal';
import { Image as ImageIcon, Upload, Plus, Trash2, X } from 'lucide-react';

interface MultiImageGalleryFieldProps {
  label: string;
  images: string[];
  onChange: (images: string[]) => void;
  media: MediaItem[];
  onMediaCreated: (newMedia: MediaItem) => void;
  helpText?: string;
  pickerTitle?: string;
}

export const MultiImageGalleryField: React.FC<MultiImageGalleryFieldProps> = ({
  label,
  images = [],
  onChange,
  media,
  onMediaCreated,
  helpText = 'يمكنك اختيار صور متعددة من المعرض أو رفع صور جديدة من جهازك',
  pickerTitle
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manualUrl, setManualUrl] = useState('');

  const handleRemoveImage = (indexToRemove: number) => {
    onChange(images.filter((_, idx) => idx !== indexToRemove));
  };

  const handleAddManualUrl = () => {
    if (!manualUrl.trim()) return;
    onChange([...images, manualUrl.trim()]);
    setManualUrl('');
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-bold text-stone-700">
          {label} ({images.length} صورة)
        </label>
        {helpText && <span className="text-[10px] text-stone-400">{helpText}</span>}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Open Gallery Selector */}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold px-3 py-1.5 rounded-xl cursor-pointer flex items-center gap-1.5 shadow-xs transition-colors"
        >
          <ImageIcon className="w-3.5 h-3.5 text-amber-700" />
          <span>اختيار من المعرض العام</span>
        </button>

        {/* Upload from Device */}
        <label className="bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold px-3 py-1.5 rounded-xl border border-stone-300 cursor-pointer flex items-center gap-1.5 transition-colors shadow-xs">
          <Upload className="w-3.5 h-3.5 text-red-700" />
          <span>رفع صورة وإضافتها للألبوم</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = ev => {
                  const dataUrl = ev.target?.result as string;
                  onChange([...images, dataUrl]);
                };
                reader.readAsDataURL(file);
              }
            }}
          />
        </label>

        {/* Manual URL input */}
        <div className="flex items-center gap-1 flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="أو أضف رابط صورة مباشر..."
            value={manualUrl}
            onChange={e => setManualUrl(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddManualUrl();
              }
            }}
            className="w-full border border-stone-300 rounded-xl px-2.5 py-1 text-xs font-mono text-left bg-white focus:outline-none focus:ring-1 focus:ring-red-600"
            dir="ltr"
          />
          <button
            type="button"
            onClick={handleAddManualUrl}
            disabled={!manualUrl.trim()}
            className="bg-stone-800 hover:bg-stone-900 disabled:opacity-40 text-white text-xs font-bold px-2.5 py-1.5 rounded-xl cursor-pointer shrink-0"
          >
            إضافة
          </button>
        </div>
      </div>

      {/* Grid of added images */}
      {images.length > 0 ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 p-2 bg-stone-50 border border-stone-200 rounded-2xl max-h-48 overflow-y-auto">
          {images.map((imgUrl, idx) => (
            <div
              key={idx}
              className="relative group aspect-square rounded-xl overflow-hidden border border-stone-200 bg-white shadow-2xs"
            >
              <img
                src={imgUrl}
                alt=""
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              <button
                type="button"
                onClick={() => handleRemoveImage(idx)}
                className="absolute top-1 left-1 w-5 h-5 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity shadow-xs cursor-pointer"
                title="حذف من الألبوم"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-3 bg-stone-50 border border-dashed border-stone-200 rounded-xl text-center text-xs text-stone-400">
          لم يتم تحديد أي صور لهذا الألبوم بعد. انقر على «اختيار من المعرض العام» لتحديد صور.
        </div>
      )}

      {/* Media Picker Modal */}
      <MediaPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        media={media}
        onMediaCreated={onMediaCreated}
        onSelect={selectedUrls => {
          // Append new unique URLs to existing images
          const newSet = Array.from(new Set([...images, ...selectedUrls]));
          onChange(newSet);
        }}
        multiple={true}
        initialSelected={images}
        title={pickerTitle || `اختيار صور لـ: ${label}`}
      />
    </div>
  );
};
