import React from 'react';
import { Comment } from './DocumentTypes';

interface CommentBubbleProps {
  comment: Comment;
  isActive: boolean;
  currentInstructionForActive: string;
  onInstructionChange: (newInstruction: string) => void;
  onSaveInstruction: (commentId: string) => void;
  onSendToAI: (commentId: string) => void;
  onAcceptSuggestion: (commentId: string) => void;
  onToggleInline: (commentId: string) => void;
  onSetActive: (commentId: string | null) => void;
  onBubbleTextareaBlur: () => void;
  isGloballyLoadingAI: boolean;
  onCloseComment: (commentId: string) => void;
  style?: React.CSSProperties;
}

const CommentBubble: React.FC<CommentBubbleProps> = ({
  comment,
  isActive,
  currentInstructionForActive,
  onInstructionChange,
  onSaveInstruction,
  onSendToAI,
  onAcceptSuggestion,
  onToggleInline,
  onSetActive,
  onBubbleTextareaBlur,
  isGloballyLoadingAI,
  onCloseComment,
  style,
}) => {
  const isThisCommentProcessing = comment.status === 'processing';
  const canEditInstruction = comment.status === 'pending' || comment.status === 'error';
  const canSendToAI =
    comment.status === 'pending' && comment.instruction && comment.instruction.trim() !== '';
  const canAcceptSuggestion = comment.status === 'suggestion_ready';
  const canToggleInline = comment.status === 'suggestion_ready' && !!comment.aiSuggestion;

  const handleTextareaFocus = () => {
    if (!isActive) {
      onSetActive(comment.id);
    }
  };

  const handleInstructionSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSaveInstruction(comment.id);
  };

  const handleSendToAISingle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSendToAI(comment.id);
  };

  const handleSuggestionAccept = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAcceptSuggestion(comment.id);
  };

  const handleBubbleClick = () => {
    if (!isActive) {
      onSetActive(comment.id);
    }
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
        cursor: 'pointer',
        position: 'relative',
        ...style,
      }}
      onClick={handleBubbleClick}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onCloseComment(comment.id);
        }}
        aria-label="Close comment"
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          background: 'none',
          border: 'none',
          fontSize: '1.2rem',
          fontWeight: 'bold',
          color: '#888',
          cursor: 'pointer',
          padding: '0 5px',
          lineHeight: '1',
          zIndex: 1,
        }}
      >
        &times;
      </button>
      <div style={{ marginBottom: '8px', paddingRight: '20px' }}>
        <strong style={{ display: 'block', fontSize: '0.9em', color: '#333' }}>
          Selected: "{comment.selectedText}"
        </strong>
        <span style={{ fontSize: '0.75em', color: '#777' }}>ID: {comment.id.substring(0, 6)}</span>
      </div>
      {canEditInstruction && (
        <textarea
          value={isActive ? currentInstructionForActive : comment.instruction}
          onChange={(e) => onInstructionChange(e.target.value)}
          onFocus={handleTextareaFocus}
          onBlur={onBubbleTextareaBlur}
          onClick={(e) => e.stopPropagation()}
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
            wordBreak: 'break-word',
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
          {canEditInstruction && (
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
          {comment.status === 'pending' && canSendToAI && (
            <button
              onClick={handleSendToAISingle}
              disabled={isGloballyLoadingAI || isThisCommentProcessing}
              style={{
                padding: '6px 10px',
                fontSize: '0.85em',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
              }}
            >
              {isThisCommentProcessing ? 'Processing...' : 'Send'}
            </button>
          )}
        </div>{' '}
        {/* Closing div for inner button group (Save/Send) */}
      </div>{' '}
      {/* Closing div for status row */}
      {/* Section for displaying AI suggestion and related actions */}
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
              wordBreak: 'break-word',
            }}
          >
            {comment.aiSuggestion}
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            {canToggleInline && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleInline(comment.id);
                }}
                disabled={isGloballyLoadingAI || isThisCommentProcessing}
                style={{ padding: '6px 10px', fontSize: '0.85em' }}
              >
                {comment.inlineVisible ? 'Hide Inline' : 'Show Inline'}
              </button>
            )}
            <button
              onClick={handleSuggestionAccept}
              disabled={isGloballyLoadingAI || isThisCommentProcessing}
              style={{
                padding: '6px 10px',
                fontSize: '0.85em',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
              }}
            >
              Apply
            </button>
          </div>
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
    </div> // Closing main wrapper div
  );
};

export default CommentBubble;
