import React, { useState, useMemo } from 'react';
import { MediaItem } from '../types';
import { api } from '../api';
import {
  Image as ImageIcon,
  Upload,
  Search,
  Filter,
  Check,
  X,
  Plus,
  Loader2,
  FolderOpen,
  Sparkles,
  Link as LinkIcon
} from 'lucide-react';

interface MediaPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  media: MediaItem[];
  onMediaCreated: (newMedia: MediaItem) => void;
  onSelect: (selectedUrls: string[]) => void;
  multiple?: boolean;
  initialSelected?: string[];
  title?: string;
  subtitle?: string;
}

export const MediaPickerModal: React.FC<MediaPickerModalProps> = ({
  isOpen,
  onClose,
  media,
  onMediaCreated,
  onSelect,
  multiple = false,
  initialSelected = [],
  title = 'معرض ومستكشف الصور',
  subtitle = 'اختر من صور المعرض القائمة أو ارفع صورة جديدة مباشرة من جهازك'
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAlbum, setSelectedAlbum] = useState<string>('all');
  const [selectedUrls, setSelectedUrls] = useState<string[]>(initialSelected);

  // Quick upload state
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadAlbum, setUploadAlbum] = useState('عام');
  const [uploadUrl, setUploadUrl] = useState('');
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Extract unique albums from media
  const availableAlbums = useMemo(() => {
    const set = new Set<string>();
    media.forEach(m => {
      if (m.albumName && m.albumName.trim()) {
        set.add(m.albumName.trim());
      }
    });
    return Array.from(set);
  }, [media]);

  // Filter photos only (or media with valid URLs)
  const filteredMedia = useMemo(() => {
    return media.filter(item => {
      // Prioritize photos, but allow if user uploaded
      const matchesSearch =
        !searchQuery.trim() ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.albumName && item.albumName.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesAlbum = selectedAlbum === 'all' || item.albumName === selectedAlbum;

      return matchesSearch && matchesAlbum;
    });
  }, [media, searchQuery, selectedAlbum]);

  if (!isOpen) return null;

  const toggleSelectUrl = (url: string) => {
    if (multiple) {
      if (selectedUrls.includes(url)) {
        setSelectedUrls(selectedUrls.filter(u => u !== url));
      } else {
        setSelectedUrls([...selectedUrls, url]);
      }
    } else {
      setSelectedUrls([url]);
    }
  };

  const handleConfirm = () => {
    onSelect(selectedUrls);
    onClose();
  };

  const handleSingleInstantSelect = (url: string) => {
    if (!multiple) {
      onSelect([url]);
      onClose();
    } else {
      toggleSelectUrl(url);
    }
  };

  // Direct upload and save
  const handleUploadNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadUrl.trim()) {
      setUploadError('يرجى اختيار صورة من جهازك أو وضع رابط صالح');
      return;
    }

    setUploadLoading(true);
    setUploadError(null);

    try {
      const res = await api.createMedia({
        type: 'photo',
        title: uploadTitle.trim() || 'صورة مرفوعة من لوحة التحكم',
        albumName: uploadAlbum.trim() || 'عام',
        url: uploadUrl.trim(),
        isVisible: true
      });

      if (res.success && res.media) {
        onMediaCreated(res.media);
        if (multiple) {
          setSelectedUrls(prev => [...prev, res.media.url]);
        } else {
          onSelect([res.media.url]);
          onClose();
          return;
        }
        setShowUploadForm(false);
        setUploadUrl('');
        setUploadTitle('');
      }
    } catch (err: any) {
      setUploadError(err.message || 'حدث خطأ أثناء حفظ الصورة');
    } finally {
      setUploadLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-70 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in" dir="rtl">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-stone-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-stone-100 flex items-center justify-between bg-stone-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-700 text-amber-300 flex items-center justify-center shadow-xs shrink-0">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-stone-900">{title}</h3>
              <p className="text-xs text-stone-500 mt-0.5">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-stone-200 hover:bg-stone-300 text-stone-600 flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar & Filters */}
        <div className="p-3 sm:p-4 border-b border-stone-100 bg-white space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                placeholder="ابحث في الصور بعنوان أو ألبوم..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-stone-50 border border-stone-200 rounded-xl pr-9 pl-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-600 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-xs"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Album selector */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <select
                  value={selectedAlbum}
                  onChange={e => setSelectedAlbum(e.target.value)}
                  className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-bold text-stone-700 cursor-pointer focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-600"
                >
                  <option value="all">كل الألبومات ({media.length})</option>
                  {availableAlbums.map(alb => (
                    <option key={alb} value={alb}>
                      {alb} ({media.filter(m => m.albumName === alb).length})
                    </option>
                  ))}
                </select>
              </div>

              {/* Toggle Quick Upload Form */}
              <button
                type="button"
                onClick={() => setShowUploadForm(!showUploadForm)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                  showUploadForm
                    ? 'bg-red-700 text-white shadow-xs'
                    : 'bg-red-50 hover:bg-red-100 text-red-800 border border-red-200'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>رفع صورة جديدة</span>
              </button>
            </div>
          </div>

          {/* Quick Upload Expandable Box */}
          {showUploadForm && (
            <form onSubmit={handleUploadNew} className="p-3.5 rounded-2xl bg-amber-50/50 border border-amber-200/80 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  رفع صورة وحفظها مباشرة بالمعرض العام
                </span>
                <button
                  type="button"
                  onClick={() => setShowUploadForm(false)}
                  className="text-stone-400 hover:text-stone-600 text-xs"
                >
                  إلغاء
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 mb-1">عنوان الصورة</label>
                  <input
                    type="text"
                    placeholder="مثال: مؤتمر أمانة قسم ثالث أكتوبر..."
                    value={uploadTitle}
                    onChange={e => setUploadTitle(e.target.value)}
                    className="w-full bg-white border border-stone-300 rounded-xl px-2.5 py-1.5 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-700 mb-1">اسم الألبوم</label>
                  <input
                    type="text"
                    list="modal-album-list"
                    placeholder="عام"
                    value={uploadAlbum}
                    onChange={e => setUploadAlbum(e.target.value)}
                    className="w-full bg-white border border-stone-300 rounded-xl px-2.5 py-1.5 text-xs"
                  />
                  <datalist id="modal-album-list">
                    <option value="فعاليات ومؤتمرات" />
                    <option value="الهوية الرسمية" />
                    <option value="أنشطة الأمانات" />
                    <option value="مبادرات ميدانية" />
                    <option value="اجتماعات هيئة المكتب" />
                  </datalist>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-700 mb-1">اختر الملف من جهازك</label>
                  <label className="flex items-center justify-center gap-1.5 bg-white hover:bg-stone-50 border border-stone-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-stone-700 cursor-pointer transition-colors truncate">
                    <Upload className="w-3.5 h-3.5 text-red-700 shrink-0" />
                    <span className="truncate">{uploadUrl ? 'تم اختيار صورة ✓' : 'تصفح جهازك...'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = ev => {
                            setUploadUrl(ev.target?.result as string);
                            if (!uploadTitle) {
                              setUploadTitle(file.name.replace(/\.[^/.]+$/, ''));
                            }
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* Or manual URL */}
              <div>
                <input
                  type="text"
                  placeholder="أو الصق رابط صورة خارجي مباشر هنا..."
                  value={uploadUrl.startsWith('data:') ? '' : uploadUrl}
                  onChange={e => setUploadUrl(e.target.value)}
                  className="w-full bg-white border border-stone-300 rounded-xl px-2.5 py-1 text-xs font-mono text-left"
                  dir="ltr"
                />
              </div>

              {uploadError && <p className="text-xs text-red-600 font-bold">{uploadError}</p>}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="submit"
                  disabled={uploadLoading || !uploadUrl}
                  className="bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  {uploadLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>حفظ في المعرض واستخدام الصورة فوراً</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Media Grid Body */}
        <div className="flex-1 overflow-y-auto p-4 bg-stone-50/50">
          {filteredMedia.length === 0 ? (
            <div className="text-center py-12 px-4 space-y-3">
              <div className="w-14 h-14 bg-stone-200/80 rounded-2xl flex items-center justify-center mx-auto text-stone-400">
                <FolderOpen className="w-7 h-7" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-stone-800">لا توجد صور مطابقة</h4>
                <p className="text-xs text-stone-500 mt-1">
                  لم يتم العثور على أي صورة بهذا البحث، يمكنك رفع صورة جديدة مباشرة لحفظها بالمعرض.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedAlbum('all');
                  setShowUploadForm(true);
                }}
                className="bg-stone-900 text-white font-bold text-xs px-4 py-2 rounded-xl cursor-pointer"
              >
                رفع صورة جديدة الآن
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filteredMedia.map(item => {
                const isSelected = selectedUrls.includes(item.url);

                return (
                  <div
                    key={item.id}
                    onClick={() => handleSingleInstantSelect(item.url)}
                    className={`group relative rounded-2xl overflow-hidden border bg-white cursor-pointer transition-all hover:shadow-md flex flex-col ${
                      isSelected
                        ? 'border-red-600 ring-2 ring-red-600/30 shadow-md bg-red-50/20'
                        : 'border-stone-200 hover:border-stone-400'
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="aspect-square bg-stone-100 overflow-hidden relative">
                      <img
                        src={item.thumbnail || item.url}
                        alt={item.title}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        referrerPolicy="no-referrer"
                      />

                      {/* Selection Badge */}
                      <div
                        className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                          isSelected
                            ? 'bg-red-700 text-white shadow-md scale-100'
                            : 'bg-black/40 text-white/70 opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </div>

                      {/* Album badge */}
                      {item.albumName && (
                        <div className="absolute bottom-1.5 right-1.5 left-1.5">
                          <span className="bg-black/60 backdrop-blur-xs text-white text-[10px] font-medium px-2 py-0.5 rounded-md truncate max-w-full inline-block">
                            {item.albumName}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Metadata */}
                    <div className="p-2.5 flex-1 flex flex-col justify-between">
                      <p className="text-xs font-bold text-stone-900 line-clamp-1 group-hover:text-red-700 transition-colors">
                        {item.title}
                      </p>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-stone-400">
                        <span>{item.type === 'video' ? 'فيديو' : 'صورة'}</span>
                        {isSelected && <span className="text-red-700 font-bold">محدد ✓</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-stone-200 bg-white flex items-center justify-between">
          <div className="text-xs text-stone-500">
            {multiple ? (
              <span>تم تحديد <strong className="text-stone-900">{selectedUrls.length}</strong> عنصر</span>
            ) : (
              <span>انقر على أي صورة لاختيارها فوراً أو اضغط تأكيد</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-stone-300 text-stone-700 font-bold text-xs hover:bg-stone-50 cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={selectedUrls.length === 0}
              className="bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white font-bold text-xs px-5 py-2 rounded-xl cursor-pointer shadow-xs flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>تأكيد الاختيار {multiple && selectedUrls.length > 0 ? `(${selectedUrls.length})` : ''}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
