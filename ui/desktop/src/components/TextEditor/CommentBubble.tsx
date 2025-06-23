import React from 'react';
import { Comment } from './DocumentTypes';

interface CommentBubbleProps {
  comment: Comment;
  isActive: boolean; // Is this the currently active comment bubble?
  currentInstructionForActive: string; // The live instruction input if this bubble is active
  onInstructionChange: (newInstruction: string) => void; // For the textarea in this bubble if active
  onSaveInstruction: (commentId: string) => void;
  onSendToAI: (commentId: string) => void; // For individual submission
  onAcceptSuggestion: (commentId: string) => void;
  onSetActive: (commentId: string | null) => void; // To make this bubble active
  onBubbleTextareaBlur: () => void; // New: To signal focus has left the textarea
  isGloballyLoadingAI: boolean; // Global AI loading state
}

const CommentBubble: React.FC<CommentBubbleProps> = ({
  comment,
  isActive,
  currentInstructionForActive,
  onInstructionChange,
  onSaveInstruction,
  onSendToAI,
  onAcceptSuggestion,
  onSetActive,
  onBubbleTextareaBlur, // New
  isGloballyLoadingAI,
}) => {
  // Diagnostic log
  console.log(
    `Bubble ${comment.id}: isActive=${isActive}, currentInstructionForActive=${currentInstructionForActive}, comment.instruction=${comment.instruction}, status=${comment.status}`
  );

  const isThisCommentProcessing = comment.status === 'processing';
  const canEditInstruction = comment.status === 'pending' || comment.status === 'error';
  const canSendToAI =
    comment.status === 'pending' && comment.instruction && comment.instruction.trim() !== '';
  const canAcceptSuggestion = comment.status === 'suggestion_ready';

  const handleTextareaFocus = () => {
    if (!isActive) {
      onSetActive(comment.id);
    }
  };

  const handleInstructionSave = () => {
    onSaveInstruction(comment.id);
  };

  const handleSendToAISingle = () => {
    onSendToAI(comment.id);
  };

  const handleSuggestionAccept = () => {
    onAcceptSuggestion(comment.id);
  };

  return (
    <div
      className={`comment-bubble ${isActive ? 'active' : ''}`}
      style={{
        border: isActive ? '2px solid #007bff' : '1px solid #d0d0d0',
        borderRadius: '6px',
        padding: '12px',
        marginBottom: '12px',
        backgroundColor: '#ffffff',
        boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.15)' : '0 1px 3px rgba(0,0,0,0.1)',
        cursor: 'pointer', // Make the whole bubble clickable to activate
      }}
      onClick={() => onSetActive(comment.id)} // Activate on click
    >
      <div style={{ marginBottom: '8px' }}>
        <strong style={{ display: 'block', fontSize: '0.9em', color: '#333' }}>
          Selected: "{comment.selectedText}"
        </strong>
        <span style={{ fontSize: '0.75em', color: '#777' }}>ID: {comment.id}</span>
      </div>

      {canEditInstruction && (
        <textarea
          value={isActive ? currentInstructionForActive : comment.instruction}
          onChange={(e) => onInstructionChange(e.target.value)}
          onFocus={handleTextareaFocus} // Also activate if textarea is directly focused
          onBlur={onBubbleTextareaBlur} // Added onBlur handler
          placeholder="Type your AI instruction..."
          rows={3}
          style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            marginBottom: '8px',
            boxSizing: 'border-box',
            fontSize: '0.9em',
          }}
          disabled={isGloballyLoadingAI || isThisCommentProcessing}
        />
      )}
      {!canEditInstruction && comment.instruction && (
        <p
          style={{
            fontSize: '0.9em',
            margin: '0 0 8px 0',
            padding: '8px',
            background: '#f0f0f0',
            borderRadius: '4px',
          }}
        >
          <strong>Instruction:</strong> {comment.instruction}
        </p>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
          marginTop: '10px',
        }}
      >
        <span
          style={{
            fontSize: '0.85em',
            fontWeight: 'bold',
            color: comment.status === 'error' ? 'red' : '#555',
          }}
        >
          Status: {comment.status}
        </span>
        <div style={{ display: 'flex', gap: '8px' }}>
          {' '}
          {/* Container for buttons */}
          {canEditInstruction && ( // Show Save only when instruction can be edited
            <button
              onClick={handleInstructionSave}
              disabled={
                isGloballyLoadingAI ||
                isThisCommentProcessing ||
                (isActive && !currentInstructionForActive.trim())
              }
              style={{ padding: '6px 10px', fontSize: '0.85em' }}
            >
              Save
            </button>
          )}
          {comment.status === 'pending' &&
            canSendToAI && ( // Show Send to AI only if pending and instruction is present
              <button
                onClick={handleSendToAISingle}
                disabled={isGloballyLoadingAI || isThisCommentProcessing} // canSendToAI already checks for instruction
                style={{
                  padding: '6px 10px',
                  fontSize: '0.85em',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                }}
              >
                {isThisCommentProcessing ? 'Processing...' : 'Send'} {/* Shorter text for button */}
              </button>
            )}
        </div>
      </div>

      {/* Old full-width Send to AI button removed as it's integrated above */}

      {canAcceptSuggestion && comment.aiSuggestion && (
        <div style={{ marginTop: '10px', borderTop: '1px dashed #eee', paddingTop: '10px' }}>
          <h5 style={{ margin: '0 0 5px 0', fontSize: '0.9em' }}>AI Suggestion:</h5>
          <div
            style={{
              background: '#e6f7ff',
              padding: '10px',
              border: '1px solid #91d5ff',
              borderRadius: '4px',
              fontSize: '0.9em',
              whiteSpace: 'pre-wrap',
              maxHeight: '120px',
              overflowY: 'auto',
              marginBottom: '8px',
            }}
          >
            {comment.aiSuggestion}
          </div>
          <button
            onClick={handleSuggestionAccept}
            disabled={isGloballyLoadingAI || isThisCommentProcessing}
            style={{
              width: '100%',
              padding: '8px',
              fontSize: '0.9em',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
            }}
          >
            Accept Suggestion
          </button>
        </div>
      )}

      {comment.status === 'applied' && (
        <p
          style={{
            fontSize: '0.9em',
            color: 'green',
            fontWeight: 'bold',
            textAlign: 'center',
            marginTop: '10px',
          }}
        >
          Suggestion Applied!
        </p>
      )}

      {comment.errorMessage && (
        <div style={{ marginTop: '10px', color: 'red', fontSize: '0.85em' }}>
          <strong>Error:</strong> {comment.errorMessage}
        </div>
      )}
    </div>
  );
};

export default CommentBubble;
