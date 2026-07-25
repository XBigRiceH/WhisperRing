import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import OnboardScreen from '../screens/OnboardScreen';
import { coordinator } from '../background/coordinator';
import { loadSession } from '../store/session';
import { ROSE } from '../ui/kit';

/**
 * Onboarding wizard (nickname → connect ring → pair / pick AI). Resumes at the
 * connect step when a login token already exists. On completion it replaces the
 * stack with the tabs so the user can't swipe back into onboarding.
 */
export default function OnboardRoute() {
  const router = useRouter();
  const [initialStep, setInitialStep] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const s = await loadSession();
      setInitialStep(s.token ? 1 : 0);
    })();
  }, []);

  if (initialStep === null) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFF5F8', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={ROSE} />
      </View>
    );
  }

  return (
    <OnboardScreen
      initialStep={initialStep}
      navigate={() => {
        // Any completion path lands on home; refresh the always-on layer so the
        // new session (token / couple) is picked up immediately.
        void coordinator.start();
        router.replace('/home');
      }}
    />
  );
}
