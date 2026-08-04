// ============================================================
//  src/components/settings/FeedbackForm.jsx
//  A one-way message to the admin. There is no history below it and no
//  endpoint to build one from — see services/feedbackApi.js.
// ============================================================

import React, { useState } from 'react';
import { submitFeedback } from '../../services/feedbackApi';
import { FEEDBACK_TYPES, MAX_MESSAGE_LENGTH } from '../../utils/feedbackTypes';
import FormStatus from '../FormStatus';
import { useFormStatus } from '../../hooks/useFormStatus';

const DEFAULT_TYPE = FEEDBACK_TYPES[0].value;

const FeedbackForm = () => {
  const [type, setType] = useState(DEFAULT_TYPE);
  const [message, setMessage] = useState('');
  const { status, setSuccess, setError: setStatusError, clear: clearStatus } = useFormStatus();
  const [loading, setLoading] = useState(false);

  // Cheap client-side gate only — the server re-validates both fields, and the
  // type against the schema enum rather than against this list.
  const canSubmit = message.trim().length > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    clearStatus();
    try {
      await submitFeedback({ type, message: message.trim() });
      // Reset before setting the line, not after: clearStatus() fires on the
      // next keystroke, and the confirmation is the only record the sender
      // gets — there is no history view to check afterwards.
      setType(DEFAULT_TYPE);
      setMessage('');
      setSuccess('Thanks — your feedback has been sent.');
    } catch (err) {
      setStatusError(err.message ?? 'Could not send your feedback. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="settings-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="feedback-type">What is this about?</label>
        <select
          id="feedback-type"
          className="settings-select"
          value={type}
          onChange={(e) => { setType(e.target.value); clearStatus(); }}
          disabled={loading}
        >
          {FEEDBACK_TYPES.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="feedback-message">Message</label>
        <textarea
          id="feedback-message"
          className="settings-textarea"
          value={message}
          maxLength={MAX_MESSAGE_LENGTH}
          rows={5}
          placeholder="Tell the admin what happened, or what you'd like to see."
          aria-describedby="feedback-count"
          onChange={(e) => { setMessage(e.target.value); clearStatus(); }}
          disabled={loading}
        />
        {/* Deliberately not a live region: a counter that announces on every
            keystroke is unusable with a screen reader. aria-describedby on the
            textarea lets it be read on demand instead. maxLength is the hard
            stop here; the server re-checks the same number. */}
        <span id="feedback-count" className="settings-form__count">
          {message.length} / {MAX_MESSAGE_LENGTH}
        </span>
      </div>

      <FormStatus status={status} />

      <div className="modal-actions">
        <button type="submit" className="modal-button modal-button--primary" disabled={loading || !canSubmit}>
          {loading ? 'Sending…' : 'Send feedback'}
        </button>
      </div>
    </form>
  );
};

export default FeedbackForm;
