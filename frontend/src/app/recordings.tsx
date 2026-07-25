import { useRouter } from 'expo-router';
import React from 'react';
import RecordingsScreen from '../screens/RecordingsScreen';

/** 语音列表, pushed from the home quick actions. */
export default function RecordingsRoute() {
  const router = useRouter();
  return <RecordingsScreen onBack={() => router.back()} />;
}
