import { useRouter } from 'expo-router';
import React from 'react';
import { coordinator } from '../background/coordinator';
import CompanionSetupScreen from '../screens/CompanionSetupScreen';

/**
 * Create / redefine the AI companion. Pushed from 我的 ("切换成 AI" / "重新定义
 * AI"); the swipe-back gesture cancels. On success it refreshes the always-on
 * layer and replaces the stack with the tabs.
 */
export default function CompanionSetupRoute() {
  const router = useRouter();
  return (
    <CompanionSetupScreen
      onDone={() => {
        void coordinator.start();
        router.replace('/home');
      }}
    />
  );
}
