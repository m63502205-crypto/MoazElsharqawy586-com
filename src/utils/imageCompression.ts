export async function readAndCompressImageFile(
  file: File,
  options: { maxDim?: number; quality?: number; maxDataUrlLength?: number } = {}
): Promise<string> {
  const maxDim = options.maxDim ?? 1600;
  const quality = options.quality ?? 0.84;
  const maxDataUrlLength = options.maxDataUrlLength ?? 520000;

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const result = ev.target?.result;
      if (typeof result === 'string' && result) {
        resolve(result);
      } else {
        reject(new Error('تعذر قراءة ملف الصورة'));
      }
    };
    reader.onerror = () => reject(new Error('تعذر قراءة ملف الصورة'));
    reader.readAsDataURL(file);
  });

  if (rawDataUrl.length < maxDataUrlLength || !rawDataUrl.startsWith('data:image/')) {
    return rawDataUrl;
  }

  return await new Promise<string>(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const renderAt = (targetMaxDim: number, targetQuality: number): string => {
          let { width, height } = img;
          if (width > targetMaxDim || height > targetMaxDim) {
            const scale = Math.min(targetMaxDim / width, targetMaxDim / height);
            width = Math.max(1, Math.round(width * scale));
            height = Math.max(1, Math.round(height * scale));
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return rawDataUrl;
          ctx.drawImage(img, 0, 0, width, height);
          return canvas.toDataURL('image/jpeg', targetQuality);
        };

        let out = renderAt(maxDim, quality);
        if (out.length > 780000) {
          out = renderAt(Math.min(maxDim, 1280), 0.74);
        }
        if (out.length > 840000) {
          out = renderAt(1024, 0.68);
        }
        resolve(out);
      } catch {
        resolve(rawDataUrl);
      }
    };
    img.onerror = () => resolve(rawDataUrl);
    img.src = rawDataUrl;
  });
}
