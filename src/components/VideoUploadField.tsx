import React, { useState } from 'react';
import { Video, Upload, X, Play, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { VideoPlayer } from './VideoPlayer';
import { api } from '../api';

interface VideoUploadFieldProps {
  label: string;
  value: string;
  onChange: (url: string) => void;
  helpText?: string;
  required?: boolean;
}

export const VideoUploadField: React.FC<VideoUploadFieldProps> = ({
  label,
  value,
  onChange,
  helpText = 'يمكنك رفع فيديو من هاتفك أو جهازك مباشرة، أو لصق رابط يوتيوب أو فيسبوك أو MP4',
  required = false
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit: 45MB
    if (file.size > 45 * 1024 * 1024) {
      setUploadError('حجم الفيديو كبير جداً. يرجى اختيار ملف فيديو أقل من 45 ميجابايت أو رفع رابطه من يوتيوب/فيسبوك.');
      return;
    }

    setUploadError(null);
    setIsUploading(true);

    const reader = new FileReader();
    reader.onload = async ev => {
      const dataUrl = ev.target?.result as string;
      if (dataUrl) {
        try {
          const res = await api.uploadMedia(dataUrl, file.name);
          if (res && res.url) {
            onChange(res.url);
          } else {
            onChange(dataUrl);
          }
        } catch {
          // If server upload fails, fallback to local dataUrl
          onChange(dataUrl);
        }
      }
      setIsUploading(false);
    };
    reader.onerror = () => {
      setUploadError('حدث خطأ أثناء قراءة ملف الفيديو، يرجى إعادة المحاولة');
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-3 bg-stone-50 border border-stone-200 p-3.5 rounded-2xl text-right">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
        <label className="block text-xs font-bold text-stone-900 flex items-center gap-1.5">
          <Video className="w-4 h-4 text-red-700" />
          <span>{label}</span>
          {required && <span className="text-red-600">*</span>}
        </label>
        {helpText && <span className="text-[10px] text-stone-500">{helpText}</span>}
      </div>

      {/* Action Bar: File Upload Button + Direct URL */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* File Upload Button */}
          <label className="bg-red-700 hover:bg-red-800 text-white text-xs font-bold px-3.5 py-2 rounded-xl cursor-pointer flex items-center gap-2 shadow-xs transition-colors">
            <Upload className="w-4 h-4" />
            <span>{isUploading ? 'جاري تجهيز ورفع الفيديو...' : 'رفع مقطع فيديو من الجهاز / الهاتف'}</span>
            <input
              type="file"
              accept="video/*"
              disabled={isUploading}
              className="hidden"
              onChange={handleFileUpload}
            />
          </label>

          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="text-stone-400 hover:text-red-700 text-xs font-medium px-2 py-1.5 rounded-lg transition-colors cursor-pointer mr-auto flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>إزالة الفيديو</span>
            </button>
          )}
        </div>

        {uploadError && (
          <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{uploadError}</span>
          </div>
        )}

        {/* Text URL Input */}
        <div className="flex items-center gap-2 bg-white border border-stone-300 rounded-xl px-3 py-2 shadow-inner">
          <input
            type="text"
            placeholder="أو الصق رابط يوتيوب (YouTube / Shorts) أو فيسبوك أو MP4 هنا..."
            value={value.startsWith('data:video') ? 'تم تحميل ملف فيديو محلي من الجهاز' : value}
            disabled={value.startsWith('data:video')}
            onChange={e => onChange(e.target.value)}
            className="w-full text-xs font-mono text-left bg-transparent focus:outline-hidden text-stone-900"
            dir="ltr"
          />
        </div>
      </div>

      {/* Live Preview if video is set */}
      {value && (
        <div className="space-y-1.5 pt-2 border-t border-stone-200">
          <div className="flex items-center justify-between text-[11px] font-bold text-stone-700">
            <span className="flex items-center gap-1 text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>معاينة الفيديو المضاف:</span>
            </span>
            <span className="font-mono text-[10px] text-stone-400">
              {value.startsWith('data:video') ? 'فيديو مرفوع من الجهاز' : 'رابط خارجي'}
            </span>
          </div>
          <div className="max-w-md mx-auto aspect-video rounded-2xl overflow-hidden border border-stone-300 bg-stone-900 shadow-md">
            <VideoPlayer url={value} className="w-full h-full" />
          </div>
        </div>
      )}
    </div>
  );
};
