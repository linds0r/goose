import React, { useState } from 'react';
import { Comment } from './DocumentTypes';
import ThreadReply from './ThreadReply';
import './ThreadStyles.css';

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
  // NEW: Thread-related props
  onSendReply?: (commentId: string, replyText: string) => void;
  onToggleThread?: (commentId: string) => void;
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
  onSendReply,
  onToggleThread,
  style,
}) => {
  const [replyText, setReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  
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

  // NEW: Thread handling functions
  const handleSendReply = () => {
    if (!replyText.trim() || !onSendReply) return;
    onSendReply(comment.id, replyText.trim());
    setReplyText('');
    setIsReplying(false);
  };

  const handleToggleThread = () => {
    if (onToggleThread) {
      onToggleThread(comment.id);
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
          
          {/* NEW: Show explanation if available */}
          {comment.explanation && (
            <div style={{ 
              background: '#f8f9fa', 
              padding: '8px', 
              borderRadius: '4px', 
              fontSize: '0.85em',
              marginBottom: '8px',
              fontStyle: 'italic',
              color: '#6c757d'
            }}>
              <strong>AI's reasoning:</strong> {comment.explanation}
            </div>
          )}
          
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
      
      {/* NEW: Thread section */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="thread-section" style={{ marginTop: '12px', borderTop: '1px solid #e5e7eb', paddingTop: '8px' }}>
          <button 
            onClick={handleToggleThread}
            className="thread-toggle"
            style={{
              fontSize: '12px',
              color: '#6b7280',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 0'
            }}
          >
            {comment.isThreadExpanded ? 'Hide' : 'Show'} replies ({comment.replies.length})
          </button>
          
          {comment.isThreadExpanded && (
            <div className="thread-replies" style={{ marginTop: '8px', maxHeight: '300px', overflowY: 'auto' }}>
              {comment.replies.map(reply => (
                <ThreadReply key={reply.id} reply={reply} />
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* NEW: Reply input section */}
      <div className="reply-section" style={{ marginTop: '8px', borderTop: '1px solid #f3f4f6', paddingTop: '8px' }}>
        {isReplying ? (
          <div className="reply-input" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Ask AI for clarification or add your thoughts..."
              className="reply-textarea"
              style={{
                minHeight: '60px',
                padding: '8px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '13px',
                resize: 'vertical'
              }}
            />
            <div className="reply-actions" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button 
                onClick={handleSendReply}
                disabled={!replyText.trim() || isGloballyLoadingAI}
                style={{
                  padding: '4px 12px',
                  fontSize: '12px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none'
                }}
              >
                Send
              </button>
              <button 
                onClick={() => setIsReplying(false)}
                style={{
                  padding: '4px 12px',
                  fontSize: '12px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button 
            onClick={() => setIsReplying(true)}
            className="start-reply-btn"
            style={{
              background: 'none',
              border: '1px solid #d1d5db',
              color: '#6b7280',
              padding: '4px 8px',
              fontSize: '12px',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Reply
          </button>
        )}
      </div>
      
      {comment.errorMessage && (
        <div style={{ marginTop: '10px', color: 'red', fontSize: '0.85em' }}>
          <strong>Error:</strong> {comment.errorMessage}
        </div>
      )}
    </div> // Closing main wrapper div
  );
};

export default CommentBubble;
