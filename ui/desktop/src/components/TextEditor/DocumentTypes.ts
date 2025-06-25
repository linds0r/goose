// /Users/lindseyf/goose-repo/ui/desktop/src/components/TextEditor/DocumentTypes.ts
import type { View, ViewOptions } from '../../App'; // Assuming ViewOptions might be needed by TextEditorProps

// New Reply interface for threaded conversations
export interface Reply {
  id: string;                    // Unique reply ID
  role: 'user' | 'assistant';    // Who authored this reply
  text: string;                  // Reply content
  timestamp: Date;               // When reply was created
  status?: 'pending' | 'sent' | 'error';  // For user replies being processed
  parentId?: string;             // For nested replies (future enhancement)
}

export interface Comment {
  id: string;
  textRange: { from: number; to: number } | null; // Can be null if AI suggestion location not found
  selectedText: string; // Original text for user comments, or AI identified text for collab suggestions
  instruction: string;
  status: 'pending' | 'processing' | 'suggestion_ready' | 'applied' | 'error';
  aiSuggestion?: string;
  explanation?: string; // NEW: AI's explanation for the suggestion
  timestamp: Date;
  errorMessage?: string;
  inlineVisible?: boolean; // For showing diffs inline
  needsMarkApplied?: boolean; // Flag for useEffect to apply mark for new AI collab suggestions
  
  // NEW: Thread support
  replies: Reply[];              // Array of threaded replies
  isThreadExpanded?: boolean;    // UI state for thread visibility
  lastActivity?: Date;           // For sorting/prioritizing active threads
}

export interface Document {
  // This interface seems more for a standalone document management system
  id: string;
  title: string;
  content: string; // TipTap JSON content or HTML
  comments: Comment[]; // If comments are stored with a document
  metadata: {
    wordCount: number;
    lastModified: Date;
    autoSaveEnabled: boolean;
    filePath?: string;
  };
}

// Enhanced AI request for thread context
export interface AIThreadRequest {
  commentId: string;
  originalText: string;
  originalInstruction: string;
  threadHistory: Reply[];        // Full conversation history
  userQuery: string;             // New user question/request
  documentContext?: string;      // Surrounding document text
}

// AI response for thread replies
export interface AIThreadResponse {
  commentId: string;
  reply: string;
  status: 'success' | 'error';
  errorMessage?: string;
}

// Props for the TextEditorView component itself
export interface TextEditorProps {
  // onClose: () => void; // onClose was in the original template, but not used in current TextEditorView
  setView: (view: View, viewOptions?: ViewOptions) => void;
  // initialDocument?: Document; // Not currently used by TextEditorView
}
