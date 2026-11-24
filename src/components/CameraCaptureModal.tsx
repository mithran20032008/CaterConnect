import React, {useEffect, useRef, useState} from 'react';
import {Camera, Image as ImageIcon, Loader2, RefreshCw, ShieldCheck, X} from 'lucide-react';
import {apiRequest} from '../lib/api';

interface CameraCaptureModalProps {
  isOpen: boolean;
  title?: string;
  explanation?: string;
  onClose: () => void;
  onUploaded: (url: string) => void;
}

function compressImageToDataUrl(
  source: HTMLVideoElement | HTMLImageElement,
  maxWidth = 640
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const w = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
    const h = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
    if (!w || !h) {
      reject(new Error('Image dimensions are invalid.'));
      return;
    }
    const scale = Math.min(1, maxWidth / w);
    const cw = Math.round(w * scale);
    const ch = Math.round(h * scale);
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Canvas not supported.'));
      return;
    }
    ctx.drawImage(source, 0, 0, cw, ch);
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to compress image.'));
      },
      'image/jpeg',
      0.82
    );
  });
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  isOpen,
  title = 'Profile Photo',
  explanation = 'CaterConnect needs your camera to take your profile photo. It is used only when you tap Take Photo.',
  onClose,
  onUploaded,
}) => {
  const [stage, setStage] = useState<'explain' | 'live' | 'preview' | 'denied'>('explain');
  const [errorMsg, setErrorMsg] = useState('');
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [uploading, setUploading] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    if (!isOpen) {
      stopStream();
      setStage('explain');
      setErrorMsg('');
      setCapturedBlob(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl('');
    }
    return () => {
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (stage === 'live' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {
        // autoplay handled
      });
    }
  }, [stage]);

  if (!isOpen) return null;

  const startCamera = async () => {
    setErrorMsg('');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMsg('Camera is not supported on this browser. Please choose a photo from your gallery.');
      setStage('denied');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {facingMode: 'user', width: {ideal: 720}, height: {ideal: 720}},
        audio: false,
      });
      streamRef.current = stream;
      setStage('live');
    } catch (err) {
      const msg =
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow camera in your browser site settings, or choose a photo from your gallery below.'
          : 'No camera detected or permission denied. You can choose a photo from your gallery below.';
      setErrorMsg(msg);
      setStage('denied');
    }
  };

  const handleCapture = async () => {
    if (!videoRef.current) return;
    try {
      const blob = await compressImageToDataUrl(videoRef.current, 640);
      stopStream();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setCapturedBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
      setStage('preview');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not capture photo.');
    }
  };

  const handleRetake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    setCapturedBlob(null);
    startCamera();
  };

  const handleGalleryFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg('');
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = async () => {
      try {
        const blob = await compressImageToDataUrl(img, 640);
        URL.revokeObjectURL(objUrl);
        stopStream();
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setCapturedBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        setStage('preview');
      } catch (err) {
        URL.revokeObjectURL(objUrl);
        setErrorMsg(err instanceof Error ? err.message : 'Invalid image file.');
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      setErrorMsg('Selected file could not be read as an image.');
    };
    img.src = objUrl;
  };

  const handleUpload = async () => {
    if (!capturedBlob || uploading) return;
    setUploading(true);
    setErrorMsg('');
    try {
      const fd = new FormData();
      fd.append('file', capturedBlob, 'profile.jpg');
      const res = await apiRequest<{url: string}>('/api/upload', {
        method: 'POST',
        body: fd,
        isFormData: true,
      });
      onUploaded(res.url);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end justify-center">
      <div className="w-full max-w-[430px] mx-auto bg-white rounded-t-[28px] p-5 shadow-2xl space-y-5 max-h-[90dvh] app-scroll pb-safe">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-bold text-[#111827] truncate">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close camera modal"
            className="w-10 h-10 rounded-full bg-[#F3F4F6] text-[#6B7280] hover:text-[#111827] flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          onChange={handleGalleryFile}
          className="hidden"
        />

        {stage === 'explain' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-[#4B6F1B]/8 border border-[#4B6F1B]/20 flex gap-3 items-start">
              <ShieldCheck className="w-5 h-5 text-[#4B6F1B] shrink-0 mt-0.5" />
              <p className="text-sm text-[#111827] leading-relaxed">{explanation}</p>
            </div>
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={startCamera}
                className="w-full min-h-[48px] rounded-full bg-[#4B6F1B] hover:bg-[#3C5A15] text-white font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>Take Photo with Camera</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full min-h-[48px] rounded-full bg-[#F3F4F6] hover:bg-gray-200 text-[#111827] font-medium text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <ImageIcon className="w-4 h-4" />
                <span>Choose from gallery</span>
              </button>
            </div>
          </div>
        )}

        {stage === 'live' && (
          <div className="space-y-4">
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-square max-h-[320px] mx-auto">
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleCapture}
                className="flex-1 min-h-[48px] rounded-full bg-[#4B6F1B] hover:bg-[#3C5A15] text-white font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>Capture</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  stopStream();
                  fileInputRef.current?.click();
                }}
                className="min-h-[48px] px-4 rounded-full bg-[#F3F4F6] text-[#111827] text-sm font-medium cursor-pointer"
              >
                Gallery
              </button>
            </div>
          </div>
        )}

        {stage === 'preview' && previewUrl && (
          <div className="space-y-4">
            <div className="rounded-2xl overflow-hidden bg-[#F3F4F6] aspect-square max-h-[300px] mx-auto">
              <img src={previewUrl} alt="Captured preview" className="w-full h-full object-cover" />
            </div>
            {errorMsg && <p className="text-xs text-[#DC2626]">{errorMsg}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleRetake}
                disabled={uploading}
                className="flex-1 min-h-[48px] rounded-full bg-[#F3F4F6] hover:bg-gray-200 text-[#111827] font-medium text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retake</span>
              </button>
              <button
                type="button"
                onClick={handleUpload}
                disabled={uploading}
                className="flex-1 min-h-[48px] rounded-full bg-[#4B6F1B] hover:bg-[#3C5A15] text-white font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                <span>{uploading ? 'Saving...' : 'Use Photo'}</span>
              </button>
            </div>
          </div>
        )}

        {stage === 'denied' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-sm text-[#111827] space-y-2">
              <p className="font-semibold text-[#111827]">Camera permission needed</p>
              <p className="text-xs text-[#6B7280] leading-relaxed">{errorMsg}</p>
              <p className="text-xs text-[#6B7280]">
                Tip: Tap the lock/camera icon in your browser address bar, set Camera to Allow, and retry — or pick an image directly from your device.
              </p>
            </div>
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full min-h-[48px] rounded-full bg-[#4B6F1B] hover:bg-[#3C5A15] text-white font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <ImageIcon className="w-4 h-4" />
                <span>Choose from gallery</span>
              </button>
              <button
                type="button"
                onClick={startCamera}
                className="w-full min-h-[44px] rounded-full bg-[#F3F4F6] text-[#111827] font-medium text-sm cursor-pointer"
              >
                Try Camera Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
