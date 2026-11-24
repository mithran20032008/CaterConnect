import React, {useState} from 'react';
import {Loader2, Star, X} from 'lucide-react';
import {apiRequest} from '../lib/api';

interface ReviewModalProps {
  isOpen: boolean;
  bookingId: number | null;
  targetName: string;
  onClose: () => void;
  onSubmitted: () => void;
}

const CRITERIA = [
  {key: 'punctuality', label: 'Punctuality'},
  {key: 'behaviour', label: 'Behaviour'},
  {key: 'work_quality', label: 'Work Quality'},
  {key: 'communication', label: 'Communication'},
  {key: 'payment_reliability', label: 'Payment Reliability'},
] as const;

export const ReviewModal: React.FC<ReviewModalProps> = ({
  isOpen,
  bookingId,
  targetName,
  onClose,
  onSubmitted,
}) => {
  const [scores, setScores] = useState<Record<string, number>>({
    punctuality: 5,
    behaviour: 5,
    work_quality: 5,
    communication: 5,
    payment_reliability: 5,
  });
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !bookingId) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await apiRequest(`/api/bookings/${bookingId}/review`, {
        method: 'POST',
        body: {...scores, comment},
      });
      onSubmitted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit rating.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end justify-center">
      <div className="w-full max-w-[430px] mx-auto bg-white rounded-t-[28px] p-5 max-h-[88dvh] app-scroll shadow-2xl space-y-4 pb-safe">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-[#111827] truncate">Rate {targetName}</h3>
            <p className="text-xs text-[#6B7280]">Your feedback helps reliable teams.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-[#F3F4F6] flex items-center justify-center text-[#6B7280] cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {CRITERIA.map((c) => (
            <div key={c.key} className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#111827]">{c.label}</span>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setScores((s) => ({...s, [c.key]: n}))}
                    className="p-1 cursor-pointer"
                    aria-label={`${c.label} ${n} stars`}
                  >
                    <Star
                      className={`w-5 h-5 ${
                        n <= scores[c.key]
                          ? 'fill-[#F59E0B] text-[#F59E0B]'
                          : 'text-gray-300'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
          ))}

          <textarea
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Share a brief note (optional)..."
            className="w-full min-w-0 bg-[#F3F4F6] rounded-2xl p-3.5 text-base text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4B6F1B]"
          />

          {error && <p className="text-xs text-[#DC2626]">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[48px] rounded-full bg-[#4B6F1B] hover:bg-[#3C5A15] text-white font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            <span>Submit Review</span>
          </button>
        </form>
      </div>
    </div>
  );
};
