import { useRouter } from 'expo-router';
import React from 'react';
import MemoriesScreen from '../screens/MemoriesScreen';

/** 想念信箱, pushed from the home quick actions. */
export default function MemoriesRoute() {
  const router = useRouter();
  return <MemoriesScreen onBack={() => router.back()} />;
}
