import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import ChatScreen from '../../screens/ChatScreen';
import RecallChatScreen from '../../screens/RecallChatScreen';
import { loadSession } from '../../store/session';

/**
 * 小奈 tab. AI mode → the companion chat (小院); human mode → 小奈·回忆助手,
 * ChatLab-backed Q&A over the couple's real conversations.
 */
export default function NaiTab() {
  const [mode, setMode] = useState<'ai' | 'human' | undefined>(undefined);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void loadSession().then((s) => {
        if (!alive) return;
        // Older sessions paired with a human partner before mode was persisted;
        // a coupleId without a mode can only mean human mode.
        setMode(s.mode ?? (s.coupleId ? 'human' : undefined));
      });
      return () => {
        alive = false;
      };
    }, []),
  );

  if (mode === undefined) return null;
  return mode === 'ai' ? <ChatScreen /> : <RecallChatScreen />;
}
