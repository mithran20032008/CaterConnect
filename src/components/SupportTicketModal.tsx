import React, {useRef, useState} from 'react';
import {Image as ImageIcon, Loader2, MessageSquare, X} from 'lucide-react';
import {apiRequest} from '../lib/api';

interface SupportTicketModalProps {
  isOpen: boolean;
  bookingId?: number | null;
  onClose: () => void;
  onCreated: () => void;
}

const CATEGORIES = [
  'Payment issue',
  'Booking or slot issue',
  'Worker/Organisation behaviour',
  'Emergency replacement help',
  'Account verification',
  'Other',
];

export const SupportTicketModal: React.FC<SupportTicketModalProps> = ({
  isOpen,
  bookingId = null,
  onClose,
  onCreated,
}) => {
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiRequest<{url: string}>('/api/upload', {
        method: 'POST',
        body: fd,
        isFormData: true,
      });
      setAttachmentUrl(res.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload image.');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setError('Please describe your issue.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await apiRequest('/api/support/tickets', {
        method: 'POST',
        body: {booking_id: bookingId, category, description: description.trim(), attachment_url: attachmentUrl},
      });
      setDescription('');
      setAttachmentUrl('');
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end justify-center">
      <div className="w-full max-w-[430px] mx-auto bg-white rounded-t-[28px] p-5 max-h-[88dvh] app-scroll shadow-2xl space-y-4 pb-safe">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare className="w-5 h-5 text-[#4B6F1B] shrink-0" />
            <h3 className="text-lg font-bold text-[#111827] truncate">Contact Support</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-[#F3F4F6] flex items-center justify-center text-[#6B7280] cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {bookingId && (
            <div className="text-xs text-[#6B7280] bg-[#F3F4F6] px-3.5 py-2 rounded-xl">
              Booking reference: <strong className="tabular-nums">#{bookingId}</strong>
            </div>
          )}

          <div className="min-w-0">
            <label className="block text-xs font-semibold text-[#111827] mb-1.5">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full min-w-0 bg-[#F3F4F6] rounded-full px-4 min-h-[46px] text-base text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4B6F1B]"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-0">
            <label className="block text-xs font-semibold text-[#111827] mb-1.5">Description *</label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explain what happened..."
              className="w-full min-w-0 bg-[#F3F4F6] rounded-2xl p-3.5 text-base text-[#111827] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-[#4B6F1B]"
            />
          </div>

          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#F3F4F6] text-xs font-semibold text-[#111827] cursor-pointer"
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
              <span>{attachmentUrl ? 'Screenshot Attached (Change)' : 'Attach Screenshot (Optional)'}</span>
            </button>
          </div>

          {error && <p className="text-xs text-[#DC2626]">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[48px] rounded-full bg-[#4B6F1B] hover:bg-[#3C5A15] text-white font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            <span>Submit Support Ticket</span>
          </button>
        </form>
      </div>
    </div>
  );
};
