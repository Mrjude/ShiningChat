import { useState } from 'react';

interface SatisfactionRatingProps {
  sessionId: string;
  onSubmit: () => void;
}

export function SatisfactionRating({ sessionId, onSubmit }: SatisfactionRatingProps) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) return;
    setSubmitting(true);
    try {
      await fetch('/api/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, rating, feedback }),
      });
      setSubmitted(true);
      setTimeout(onSubmit, 1500);
    } catch (e) {
      console.error('Failed to submit rating:', e);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="mt-3 p-3 rounded-xl text-center text-sm" style={{ backgroundColor: '#D4EDDA', color: '#155724' }}>
        感谢您的评价！
      </div>
    );
  }

  const ratingLabels = ['', '非常不满意', '不满意', '一般', '满意', '非常满意'];

  return (
    <div className="mt-3 p-4 rounded-xl border" style={{ borderColor: 'var(--td-border-level-2-color)', backgroundColor: 'var(--td-bg-color-container)' }}>
      <p className="text-sm font-medium mb-2" style={{ color: 'var(--td-text-color-primary)' }}>
        请对本次服务进行评价
      </p>

      {/* 星级评分 */}
      <div className="flex items-center gap-1 mb-2">
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            onClick={() => setRating(star)}
            onMouseEnter={() => setHoveredRating(star)}
            onMouseLeave={() => setHoveredRating(0)}
            className="text-2xl transition-transform hover:scale-110"
            style={{ color: star <= (hoveredRating || rating) ? '#F59E0B' : 'var(--td-text-color-placeholder)' }}
          >
            ★
          </button>
        ))}
        {(hoveredRating || rating) > 0 && (
          <span className="text-xs ml-2" style={{ color: 'var(--td-text-color-secondary)' }}>
            {ratingLabels[hoveredRating || rating]}
          </span>
        )}
      </div>

      {/* 反馈输入 */}
      <textarea
        value={feedback}
        onChange={e => setFeedback(e.target.value)}
        placeholder="请输入您的建议（可选）"
        rows={2}
        className="w-full px-3 py-2 rounded-lg border text-sm resize-none mb-2"
        style={{
          borderColor: 'var(--td-border-level-2-color)',
          backgroundColor: 'var(--td-bg-color-secondarycontainer)',
          color: 'var(--td-text-color-primary)',
        }}
      />

      <button
        onClick={handleSubmit}
        disabled={rating === 0 || submitting}
        className="px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50"
        style={{ backgroundColor: rating > 0 ? '#3B82F6' : 'var(--td-bg-color-secondarycontainer)' }}
      >
        {submitting ? '提交中...' : '提交评价'}
      </button>
    </div>
  );
}
