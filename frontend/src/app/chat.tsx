import { useRouter } from 'expo-router';
import React from 'react';
import ChatScreen from '../screens/ChatScreen';

/** AI companion chat. Pushed from home, so 返回 pops back to the tabs. */
export default function ChatRoute() {
  const router = useRouter();
  return <ChatScreen onBack={() => router.back()} />;
}
