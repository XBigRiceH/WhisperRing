import { useRouter } from 'expo-router';
import React from 'react';
import AnalysisScreen from '../screens/AnalysisScreen';

/** Chat analysis dashboard. Pushed from home, so 返回 pops back to the tabs. */
export default function AnalysisRoute() {
  const router = useRouter();
  return <AnalysisScreen onBack={() => router.back()} />;
}
