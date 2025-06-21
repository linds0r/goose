import { Document } from '../DocumentTypes';

// const DOCUMENTS_DIR = 'goose-documents'; // This line is removed

export class DocumentStorage {
  static async saveDocument(document: Document): Promise<string> {
    try {
      // Use localStorage for now (we'll upgrade to file system later)
      const documentsKey = 'goose-text-editor-documents';
      const existingDocs = this.getAllDocuments();

      // Update or add the document
      const updatedDocs = existingDocs.filter((doc) => doc.id !== document.id);
      updatedDocs.push({
        ...document,
        metadata: {
          ...document.metadata,
          lastModified: new Date(),
        },
      });

      localStorage.setItem(documentsKey, JSON.stringify(updatedDocs));

      return `localStorage:${document.id}`;
    } catch (error) {
      console.error('Failed to save document:', error);
      throw error;
    }
  }

  static async loadDocument(documentId: string): Promise<Document | null> {
    try {
      const docs = this.getAllDocuments();
      return docs.find((doc) => doc.id === documentId) || null;
    } catch (error) {
      console.error('Failed to load document:', error);
      return null;
    }
  }

  static getAllDocuments(): Document[] {
    try {
      const documentsKey = 'goose-text-editor-documents';
      const stored = localStorage.getItem(documentsKey);
      if (!stored) return [];

      const docs = JSON.parse(stored) as Document[];
      // Convert date strings back to Date objects
      return docs.map((doc) => ({
        ...doc,
        // Ensure metadata and lastModified exist before trying to create a Date from it
        metadata: doc.metadata
          ? {
              ...doc.metadata,
              lastModified: doc.metadata.lastModified
                ? new Date(doc.metadata.lastModified)
                : new Date(),
            }
          : { lastModified: new Date(), wordCount: 0, autoSaveEnabled: false }, // Provide default metadata if missing
        // Ensure comments exist and map them
        comments: Array.isArray(doc.comments)
          ? doc.comments.map((comment) => ({
              ...comment,
              timestamp: new Date(comment.timestamp),
              responseTimestamp: comment.responseTimestamp
                ? new Date(comment.responseTimestamp)
                : undefined,
            }))
          : [], // Default to empty array if comments are not an array
      }));
    } catch (error) {
      console.error('Failed to get documents:', error);
      return [];
    }
  }

  static async listDocuments(): Promise<Document[]> {
    const documents = this.getAllDocuments();
    return documents.sort(
      (a, b) =>
        new Date(b.metadata.lastModified).getTime() - new Date(a.metadata.lastModified).getTime()
    );
  }

  static async deleteDocument(documentId: string): Promise<void> {
    try {
      const documentsKey = 'goose-text-editor-documents';
      const docs = this.getAllDocuments();
      const filteredDocs = docs.filter((doc) => doc.id !== documentId);
      localStorage.setItem(documentsKey, JSON.stringify(filteredDocs));
    } catch (error) {
      console.error('Failed to delete document:', error);
      throw error;
    }
  }
}
