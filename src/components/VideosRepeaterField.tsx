import React, { useState } from 'react';
import { Video, Plus, Trash2, ExternalLink, Play, Upload } from 'lucide-react';

export interface VideoEntry {
  title?: string;
  url: string;
}

interface VideosRepeaterFieldProps {
  label?: string;
  videos: VideoEntry[];
  onChange: (videos: VideoEntry[]) => void;
  helpText?: string;
}

export const VideosRepeaterField: React.FC<VideosRepeaterFieldProps> = ({
  label = 'مقاطع الفيديو المرفقة',
  videos = [],
  onChange,
  helpText = 'يمكنك إضافة أكثر من فيديو (روابط يوتيوب أو روابط مباشرة MP4 أو رفع ملف فيديو مباشرة)'
}) => {
  const [newUrl, setNewUrl] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 45 * 1024 * 1024) {
      alert('حجم الفيديو كبير، يرجى اختيار ملف أقل من 45 ميجابايت أو لصق رابط يوتيوب.');
      return;
    }

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = ev => {
      const result = ev.target?.result as string;
      if (result) {
        onChange([
          ...videos,
          {
            url: result,
            title: newTitle.trim() || file.name.replace(/\.[^/.]+$/, "")
          }
        ]);
        setNewTitle('');
      }
      setIsUploading(false);
    };
    reader.onerror = () => {
      alert('تعذر قراءة ملف الفيديو');
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleAdd = () => {
    if (!newUrl.trim()) return;
    onChange([
      ...videos,
      {
        url: newUrl.trim(),
        title: newTitle.trim() || undefined
      }
    ]);
    setNewUrl('');
    setNewTitle('');
  };

  const handleRemove = (index: number) => {
    onChange(videos.filter((_, idx) => idx !== index));
  };

  const handleUpdate = (index: number, updated: Partial<VideoEntry>) => {
    const list = [...videos];
    list[index] = { ...list[index], ...updated };
    onChange(list);
  };

  return (
    <div className="space-y-3 bg-stone-50 border border-stone-200 p-3.5 rounded-2xl">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs font-bold text-stone-800">
          <Video className="w-4 h-4 text-red-600" />
          <span>{label}</span>
          <span className="text-[11px] font-semibold text-stone-500">({videos.length} فيديو)</span>
        </label>
        {helpText && <span className="text-[10px] text-stone-400">{helpText}</span>}
      </div>

      {/* New Video Input Box & Upload button */}
      <div className="space-y-2 p-2.5 bg-white border border-stone-200 rounded-xl">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
          <div className="sm:col-span-5">
            <input
              type="text"
              placeholder="عنوان الفيديو (مثال: كلمة الأمين العام)..."
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs text-stone-800"
            />
          </div>
          <div className="sm:col-span-5">
            <input
              type="text"
              placeholder="رابط الفيديو (YouTube أو فيسبوك أو MP4)..."
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs font-mono text-left text-stone-800"
              dir="ltr"
            />
          </div>
          <div className="sm:col-span-2 flex items-center">
            <button
              type="button"
              onClick={handleAdd}
              disabled={!newUrl.trim()}
              className="w-full bg-red-700 hover:bg-red-800 disabled:opacity-40 text-white font-bold text-xs py-1.5 px-3 rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة</span>
            </button>
          </div>
        </div>

        {/* Upload file from device option */}
        <div className="flex items-center gap-2 pt-1 border-t border-stone-100 text-xs">
          <label className="inline-flex items-center gap-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 text-[11px] font-bold px-3 py-1.5 rounded-lg cursor-pointer transition-colors">
            <Upload className="w-3.5 h-3.5 text-red-700" />
            <span>{isUploading ? 'جاري رفع الفيديو...' : 'أو رفع ملف فيديو من جهازك / هاتفك'}</span>
            <input
              type="file"
              accept="video/*"
              disabled={isUploading}
              className="hidden"
              onChange={handleFileUpload}
            />
          </label>
        </div>
      </div>

      {/* List of Videos */}
      {videos.length > 0 ? (
        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
          {videos.map((vid, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between gap-2 p-2 bg-white border border-stone-200 rounded-xl shadow-2xs hover:border-amber-400 transition-colors"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                  <Play className="w-3.5 h-3.5 fill-current" />
                </div>
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={vid.title || ''}
                    placeholder="عنوان الفيديو..."
                    onChange={e => handleUpdate(idx, { title: e.target.value })}
                    className="w-full text-xs font-bold text-stone-900 border-b border-transparent hover:border-stone-300 focus:border-red-600 focus:outline-none bg-transparent"
                  />
                  <div className="text-[10px] font-mono text-stone-500 truncate" dir="ltr">
                    {vid.url}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <a
                  href={vid.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-lg transition-colors"
                  title="فتح الرابط"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  type="button"
                  onClick={() => handleRemove(idx)}
                  className="p-1.5 text-red-600 hover:text-white hover:bg-red-600 rounded-lg transition-colors cursor-pointer"
                  title="حذف الفيديو"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-2 text-stone-400 text-xs italic">
          لم يتم إضافة أي مقاطع فيديو بعد.
        </div>
      )}
    </div>
  );
};
