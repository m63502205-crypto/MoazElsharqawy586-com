import React, { useState } from 'react';
import { MediaItem } from '../types';
import { MediaPickerModal } from './MediaPickerModal';
import { Image as ImageIcon, Upload, Trash2, ExternalLink } from 'lucide-react';

interface ImageFieldWithPickerProps {
  label: string;
  value: string;
  onChange: (url: string) => void;
  media: MediaItem[];
  onMediaCreated: (newMedia: MediaItem) => void;
  shape?: 'circle' | 'rounded' | 'banner' | 'square';
  placeholder?: string;
  helpText?: string;
  pickerTitle?: string;
}

export const ImageFieldWithPicker: React.FC<ImageFieldWithPickerProps> = ({
  label,
  value,
  onChange,
  media,
  onMediaCreated,
  shape = 'rounded',
  placeholder = 'أو ضع رابط صورة مباشر هنا...',
  helpText,
  pickerTitle
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);

  // Shape classes for the preview box
  const shapeClass =
    shape === 'circle'
      ? 'w-14 h-14 rounded-full'
      : shape === 'banner'
      ? 'w-24 h-14 rounded-xl'
      : shape === 'square'
      ? 'w-14 h-14 rounded-xl'
      : 'w-16 h-16 rounded-xl';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-bold text-stone-700">{label}</label>
        {helpText && <span className="text-[10px] text-stone-400">{helpText}</span>}
      </div>

      <div className="flex items-start gap-3">
        {/* Preview Thumbnail */}
        {value ? (
          <div className="relative group shrink-0">
            <img
              src={value}
              alt="معاينة"
              className={`${shapeClass} object-cover border-2 border-red-700 shadow-xs bg-stone-100`}
              referrerPolicy="no-referrer"
            />
            <button
              type="button"
              onClick={() => onChange('')}
              title="إزالة الصورة"
              className="absolute -top-1.5 -left-1.5 w-5 h-5 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity shadow-xs cursor-pointer"
            >
              ×
            </button>
          </div>
        ) : (
          <div
            className={`${shapeClass} bg-stone-100 border-2 border-dashed border-stone-300 flex items-center justify-center text-stone-400 text-xs shrink-0 select-none`}
          >
            <ImageIcon className="w-5 h-5 opacity-40" />
          </div>
        )}

        {/* Action Controls & Input */}
        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* Choose from Gallery Button */}
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold px-3 py-1.5 rounded-xl cursor-pointer flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <ImageIcon className="w-3.5 h-3.5 text-amber-700" />
              <span>اختيار من المعرض</span>
            </button>

            {/* Direct Device Upload Button */}
            <label className="bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold px-3 py-1.5 rounded-xl border border-stone-300 cursor-pointer flex items-center gap-1.5 transition-colors shadow-xs">
              <Upload className="w-3.5 h-3.5 text-red-700" />
              <span>رفع من الجهاز</span>
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
                      onChange(dataUrl);
                    };
                    reader.readAsDataURL(file);
                  }
                }}
              />
            </label>

            {/* Clear button */}
            {value && (
              <button
                type="button"
                onClick={() => onChange('')}
                className="text-stone-400 hover:text-red-600 text-xs flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                <span>إزالة</span>
              </button>
            )}
          </div>

          {/* Direct URL input */}
          <input
            type="text"
            placeholder={placeholder}
            value={value.startsWith('data:') ? '' : value}
            onChange={e => onChange(e.target.value)}
            className="w-full border border-stone-300 rounded-xl px-3 py-1.5 text-xs font-mono text-left bg-white focus:outline-none focus:ring-1 focus:ring-red-600"
            dir="ltr"
          />
        </div>
      </div>

      {/* Reusable Modal */}
      <MediaPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        media={media}
        onMediaCreated={onMediaCreated}
        onSelect={urls => {
          if (urls.length > 0) {
            onChange(urls[0]);
          }
        }}
        multiple={false}
        initialSelected={value ? [value] : []}
        title={pickerTitle || `اختيار صورة لـ: ${label}`}
      />
    </div>
  );
};
