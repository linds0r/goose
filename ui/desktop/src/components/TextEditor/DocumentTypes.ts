import { type View, type ViewOptions } from '../../App';

export interface Comment {
  id: string;
  textRange: { from: number; to: number };
  selectedText: string;
  userComment: string;
  timestamp: Date;
  resolved: boolean;
  aiResponse?: string;
  responseTimestamp?: Date;
}

export interface Document {
  id: string;
  title: string;
  content: string; // TipTap JSON content
  comments: Comment[];
  metadata: {
    wordCount: number;
    lastModified: Date;
    autoSaveEnabled: boolean;
    filePath?: string;
  };
}

export interface TextEditorProps {
  onClose: () => void;
  setView: (view: View, viewOptions?: ViewOptions) => void;
  initialDocument?: Document;
}
