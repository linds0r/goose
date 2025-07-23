import React from 'react';
import { Reply } from './DocumentTypes';

interface ThreadReplyProps {
  reply: Reply;
}

const formatTimestamp = (timestamp: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - timestamp.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return timestamp.toLocaleDateString();
};

const ThreadReply: React.FC<ThreadReplyProps> = ({ reply }) => {
  return (
    <div className={`thread-reply ${reply.role === 'assistant' ? 'ai-reply' : 'user-reply'}`}>
      <div className="reply-header">
        <span className="reply-author">
          {reply.role === 'assistant' ? (
            <span className="ai-badge">AI</span>
          ) : (
            <span className="user-badge">You</span>
          )}
        </span>
        <span className="reply-timestamp">
          {formatTimestamp(reply.timestamp)}
        </span>
      </div>
      <div className="reply-content">
        {reply.text}
      </div>
      {reply.status === 'pending' && (
        <div className="reply-status">Sending...</div>
      )}
      {reply.status === 'error' && (
        <div className="reply-status error">Failed to send</div>
      )}
    </div>
  );
};

export default ThreadReply;
