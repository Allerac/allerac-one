'use client';

import { useEffect } from 'react';

interface MemorySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  systemMessageEdit: string;
  setSystemMessageEdit: (value: string) => void;
  systemMessage: string;
  onSave: () => Promise<void>;
}

export default function MemorySettingsModal({
  isOpen,
  onClose,
  isDarkMode,
  systemMessageEdit,
  setSystemMessageEdit,
  systemMessage,
  onSave
}: MemorySettingsModalProps) {
  // Sync systemMessageEdit with systemMessage when modal opens
  useEffect(() => {
    if (isOpen) {
      setSystemMessageEdit(systemMessage);
    }
  }, [isOpen, systemMessage, setSystemMessageEdit]);

  if (!isOpen) return null;

  const handleSave = async () => {
    await onSave();
    onClose();
  };

  const handleCancel = () => {
    setSystemMessageEdit(systemMessage);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`backdrop-blur-md rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col ${isDarkMode ? 'bg-gray-800/95 border border-gray-700' : 'bg-white/95 border border-gray-200'}`}>
        <div className={`p-6 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <h2 className={`text-xl font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>Memory Settings</h2>
          <p className={`text-sm mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            Configure your personal memory that will be used across all your conversations.
            This helps the AI remember important context and instructions specific to you.
          </p>
        </div>
        <div className="p-6 flex-1 overflow-y-auto">
          <div>
            <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              System Message (Your Personal Memory)
            </label>
            <textarea
              value={systemMessageEdit}
              onChange={(e) => setSystemMessageEdit(e.target.value)}
              placeholder="Enter information and instructions that the AI should remember about you..."
              rows={12}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm ${isDarkMode ? 'border-gray-600 bg-gray-700 text-gray-100 placeholder-gray-500' : 'border-gray-300 bg-white text-gray-900'}`}
            />
            <p className={`text-xs mt-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              💡 Include important context, special instructions, your preferences, or any information 
              that should be available to the AI in every conversation. This is private to you only.
            </p>
          </div>
        </div>
        <div className={`p-6 border-t flex gap-3 ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <button
            onClick={handleSave}
            disabled={!systemMessageEdit.trim()}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Save Memory
          </button>
          <button
            onClick={handleCancel}
            className={`flex-1 px-4 py-2 rounded-md transition-colors ${isDarkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-300 text-gray-700 hover:bg-gray-400'}`}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
