import React, { useState } from 'react';
import { MediaItem } from '../types';
import { MediaPickerModal } from './MediaPickerModal';
import {
  Image as ImageIcon,
  Upload,
  Plus,
  Trash2,
  X,
  ArrowRight,
  ArrowLeft,
  Eye,
  CheckCircle2,
  Layers
} from 'lucide-react';

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
  helpText = 'يمكنك رفع صور متعددة دفعة واحدة من جهازك، أو اختيارها من المعرض وإعادة ترتيبها',
  pickerTitle
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Remove an image
  const handleRemoveImage = (indexToRemove: number) => {
    onChange(images.filter((_, idx) => idx !== indexToRemove));
  };

  // Move image earlier/later in the list (reorder)
  const handleMove = (index: number, direction: 'earlier' | 'later') => {
    const targetIndex = direction === 'earlier' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= images.length) return;
    const updated = [...images];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    onChange(updated);
  };

  // Handle multiple file upload from computer or phone gallery
  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const readPromises: Promise<string>[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      readPromises.push(
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = ev => {
            if (ev.target?.result) {
              resolve(ev.target.result as string);
            } else {
              reject(new Error('Failed to read file'));
            }
          };
          reader.onerror = err => reject(err);
          reader.readAsDataURL(file);
        })
      );
    }

    try {
      const results = await Promise.all(readPromises);
      // Append unique images
      const newImages = [...images, ...results];
      onChange(newImages);
    } catch (err) {
      console.error('Error reading files:', err);
    } finally {
      setIsUploading(false);
      // Reset input value so same files can be chosen again if needed
      e.target.value = '';
    }
  };

  const handleAddManualUrl = () => {
    if (!manualUrl.trim()) return;
    onChange([...images, manualUrl.trim()]);
    setManualUrl('');
  };

  return (
    <div className="space-y-3 bg-stone-50/80 border border-stone-200 p-3.5 rounded-2xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
        <label className="block text-xs font-bold text-stone-900 flex items-center gap-1.5">
          <Layers className="w-4 h-4 text-amber-600" />
          <span>{label}</span>
          <span className="bg-red-700 text-white text-[10px] font-black px-2 py-0.5 rounded-md">
            {images.length} صورة
          </span>
        </label>
        {helpText && <span className="text-[10px] text-stone-500">{helpText}</span>}
      </div>

      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Upload Multiple Images from Device / Phone Gallery */}
        <label className="bg-red-700 hover:bg-red-800 text-white text-xs font-bold px-3.5 py-2 rounded-xl cursor-pointer flex items-center gap-2 shadow-xs transition-colors">
          <Upload className="w-4 h-4" />
          <span>{isUploading ? 'جاري رفع الصور...' : 'إضافة صور متعددة من الجهاز / الهاتف'}</span>
          <input
            type="file"
            multiple
            accept="image/*"
            disabled={isUploading}
            className="hidden"
            onChange={handleFilesSelected}
          />
        </label>

        {/* Open Media Picker */}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="bg-white hover:bg-amber-50 text-stone-800 hover:text-amber-900 border border-stone-300 hover:border-amber-400 text-xs font-bold px-3 py-2 rounded-xl cursor-pointer flex items-center gap-1.5 shadow-2xs transition-colors"
        >
          <ImageIcon className="w-3.5 h-3.5 text-amber-600" />
          <span>اختيار من المعرض العام</span>
        </button>

        {/* Clear all images button if list is long */}
        {images.length > 1 && (
          <button
            type="button"
            onClick={() => {
              if (confirm('هل أنت متأكد من تفريغ كافة الصور من هذا الألبوم؟')) {
                onChange([]);
              }
            }}
            className="text-stone-400 hover:text-red-700 text-xs font-medium px-2 py-1.5 rounded-lg transition-colors cursor-pointer mr-auto"
          >
            تفريغ الكل ({images.length})
          </button>
        )}
      </div>

      {/* Manual URL Input Bar */}
      <div className="flex items-center gap-1.5 bg-white border border-stone-300 rounded-xl p-1 shadow-inner">
        <input
          type="text"
          placeholder="أو ألصق رابط صورة مباشر (URL)..."
          value={manualUrl}
          onChange={e => setManualUrl(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddManualUrl();
            }
          }}
          className="w-full px-2.5 py-1 text-xs font-mono text-left bg-transparent focus:outline-hidden"
          dir="ltr"
        />
        <button
          type="button"
          onClick={handleAddManualUrl}
          disabled={!manualUrl.trim()}
          className="bg-stone-900 hover:bg-stone-800 disabled:opacity-30 text-white text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer shrink-0 transition-colors"
        >
          إضافة
        </button>
      </div>

      {/* Gallery Cards & Reordering Grid */}
      {images.length > 0 ? (
        <div className="space-y-2">
          <div className="text-[11px] text-stone-500 flex items-center justify-between">
            <span>الصور المرفقة (يمكنك استخدام الأسهم لإعادة ترتيب أسبقية ظهور الصور):</span>
            <span className="font-bold text-red-700">الصورة #1 تظهر كغلاف رئيسي</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 max-h-64 overflow-y-auto p-2 bg-white border border-stone-200 rounded-xl shadow-inner">
            {images.map((imgUrl, idx) => (
              <div
                key={idx}
                className={`relative group aspect-square rounded-xl overflow-hidden border-2 bg-stone-100 flex flex-col justify-between shadow-2xs transition-all ${
                  idx === 0 ? 'border-amber-500 shadow-amber-100 ring-2 ring-amber-500/20' : 'border-stone-200 hover:border-red-400'
                }`}
              >
                <img
                  src={imgUrl}
                  alt={`صورة ${idx + 1}`}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />

                {/* Index / Cover Badge */}
                <div className="absolute top-1 right-1">
                  <span
                    className={`text-[9px] font-black px-1.5 py-0.5 rounded shadow-xs ${
                      idx === 0 ? 'bg-amber-500 text-stone-950 font-black' : 'bg-stone-900/80 text-white'
                    }`}
                  >
                    {idx === 0 ? '⭐ الرئيسية' : `#${idx + 1}`}
                  </span>
                </div>

                {/* Top Left Delete Button */}
                <button
                  type="button"
                  onClick={() => handleRemoveImage(idx)}
                  className="absolute top-1 left-1 w-6 h-6 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center text-xs shadow-md opacity-90 hover:opacity-100 cursor-pointer transition-opacity"
                  title="حذف هذه الصورة من الألبوم"
                >
                  <X className="w-3.5 h-3.5" />
                </button>

                {/* Bottom Overlay Controls (Preview + Reorder) */}
                <div className="absolute bottom-0 inset-x-0 bg-stone-950/80 backdrop-blur-xs py-1 px-1.5 flex items-center justify-between opacity-90 group-hover:opacity-100 transition-opacity">
                  {/* Move earlier in RTL (ArrowRight moves towards index 0) */}
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => handleMove(idx, 'earlier')}
                    className="p-1 text-white hover:text-amber-400 disabled:opacity-20 cursor-pointer"
                    title="تقديم الصورة للأمام"
                  >
                    <ArrowRight className="w-3 h-3" />
                  </button>

                  {/* Preview full size */}
                  <button
                    type="button"
                    onClick={() => setPreviewImage(imgUrl)}
                    className="p-1 text-white hover:text-amber-400 cursor-pointer"
                    title="معاينة بالحجم الكامل"
                  >
                    <Eye className="w-3 h-3" />
                  </button>

                  {/* Move later in RTL (ArrowLeft moves towards end) */}
                  <button
                    type="button"
                    disabled={idx === images.length - 1}
                    onClick={() => handleMove(idx, 'later')}
                    className="p-1 text-white hover:text-amber-400 disabled:opacity-20 cursor-pointer"
                    title="تأخير الصورة للخلف"
                  >
                    <ArrowLeft className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-4 bg-white border border-dashed border-stone-300 rounded-xl text-center text-xs text-stone-500 space-y-1">
          <ImageIcon className="w-8 h-8 text-stone-300 mx-auto" />
          <p className="font-semibold text-stone-700">لم يتم إرفاق صور إضافية بعد</p>
          <p className="text-[11px] text-stone-400">
            يمكنك الضغط على زر «إضافة صور متعددة من الجهاز / الهاتف» لتحديد باقة من الصور دفعة واحدة.
          </p>
        </div>
      )}

      {/* Admin Image Preview Lightbox */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-w-3xl max-h-[90vh] bg-stone-900 rounded-2xl overflow-hidden p-2 text-center"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-3 left-3 p-2 bg-stone-800 text-white rounded-full hover:bg-stone-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={previewImage}
              alt="معاينة"
              className="max-h-[80vh] w-auto mx-auto object-contain rounded-lg"
            />
          </div>
        </div>
      )}

      {/* Media Picker Modal */}
      <MediaPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        media={media}
        onMediaCreated={onMediaCreated}
        onSelect={selectedUrls => {
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
