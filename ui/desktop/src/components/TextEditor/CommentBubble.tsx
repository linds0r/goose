import React, { useState } from 'react';
import { Comment } from './DocumentTypes';
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
      onClick={handleBubbleClick}
      style={style}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onCloseComment(comment.id);
        }}
        className="comment-bubble-close-btn"
        aria-label="Close comment"
      >
        ×
      </button>

      {/* Selected text display */}
      <div className="comment-bubble-selected-text">"{comment.selectedText}"</div>

      {/* Instruction input/display */}
      {canEditInstruction ? (
        <div className="comment-bubble-instruction">
          <textarea
            value={isActive ? currentInstructionForActive : comment.instruction}
            onChange={(e) => onInstructionChange(e.target.value)}
            onFocus={handleTextareaFocus}
            onBlur={onBubbleTextareaBlur}
            onClick={(e) => e.stopPropagation()}
            placeholder="Type your AI instruction..."
            disabled={isGloballyLoadingAI || isThisCommentProcessing}
          />
        </div>
      ) : (
        comment.instruction && (
          <div className="comment-bubble-instruction">
            <strong>Instruction:</strong> {comment.instruction}
          </div>
        )
      )}

      {/* Status and action buttons */}
      <div className="comment-bubble-header">
        <span className={`comment-bubble-status ${comment.status}`}>{comment.status}</span>
        <div className="comment-bubble-actions">
          {canEditInstruction && (
            <button
              onClick={handleInstructionSave}
              disabled={
                isGloballyLoadingAI ||
                isThisCommentProcessing ||
                (isActive && !currentInstructionForActive.trim())
              }
              className="comment-bubble-btn"
            >
              Save
            </button>
          )}
          {comment.status === 'pending' && canSendToAI && (
            <button
              onClick={handleSendToAISingle}
              disabled={isGloballyLoadingAI || isThisCommentProcessing}
              className="comment-bubble-btn primary"
            >
              {isThisCommentProcessing ? 'Processing...' : 'Send'}
            </button>
          )}
        </div>
      </div>

      {/* AI suggestion display */}
      {canAcceptSuggestion && comment.aiSuggestion && (
        <div>
          {comment.explanation && (
            <div className="comment-bubble-ai-response">
              <strong>AI's reasoning:</strong> {comment.explanation}
            </div>
          )}

          <div className="comment-bubble-ai-response">{comment.aiSuggestion}</div>

          <div className="comment-bubble-actions">
            {canToggleInline && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleInline(comment.id);
                }}
                disabled={isGloballyLoadingAI || isThisCommentProcessing}
                className="comment-bubble-btn"
              >
                {comment.inlineVisible ? 'Hide Inline' : 'Show Inline'}
              </button>
            )}
            <button
              onClick={handleSuggestionAccept}
              disabled={isGloballyLoadingAI || isThisCommentProcessing}
              className="comment-bubble-btn success"
            >
              Apply
            </button>
          </div>
        </div>
      )}

      {/* Applied status */}
      {comment.status === 'applied' && (
        <div className="comment-bubble-ai-response" style={{ color: '#137333', fontWeight: 500 }}>
          ✓ Suggestion Applied!
        </div>
      )}

      {/* Thread section */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="comment-bubble-thread">
          <button onClick={handleToggleThread} className="comment-bubble-thread-toggle">
            {comment.isThreadExpanded ? 'Hide' : 'Show'} replies ({comment.replies.length})
          </button>

          {comment.isThreadExpanded && (
            <div style={{ marginTop: '8px', maxHeight: '300px', overflowY: 'auto' }}>
              {comment.replies.map((reply) => (
                <div key={reply.id} className={`comment-bubble-reply ${reply.role}`}>
                  <div style={{ fontSize: '11px', color: '#9aa0a6', marginBottom: '4px' }}>
                    {reply.role === 'user' ? 'You' : 'AI'} • {reply.timestamp.toLocaleTimeString()}
                  </div>
                  {reply.text}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reply input section */}
      <div className="comment-bubble-thread">
        {isReplying ? (
          <div className="comment-bubble-reply-input">
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Ask AI for clarification or add your thoughts..."
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendReply();
                }
              }}
            />
            <button onClick={handleSendReply} disabled={!replyText.trim() || isGloballyLoadingAI}>
              Send
            </button>
            <button onClick={() => setIsReplying(false)} style={{ backgroundColor: '#9aa0a6' }}>
              Cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setIsReplying(true)} className="comment-bubble-thread-toggle">
            Reply
          </button>
        )}
      </div>

      {/* Error message */}
      {comment.errorMessage && (
        <div style={{ marginTop: '12px', color: '#d93025', fontSize: '13px' }}>
          <strong>Error:</strong> {comment.errorMessage}
        </div>
      )}
    </div>
  );
};

export default CommentBubble;
