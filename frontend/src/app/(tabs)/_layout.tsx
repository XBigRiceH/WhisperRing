import { Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { colors, shadow } from '../../ui/theme';

/**
 * Bottom navigation, 3 tabs: 想念 (home) · 小奈 (AI chat) · 我的.
 * 连接 (ring management) stays as a route but is hidden from the tab bar;
 * it is reached via in-page entries instead.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarStyle: styles.bar,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.bgTop },
      }}
    >
      <Tabs.Screen name="ring" options={{ href: null }} />
      <Tabs.Screen
        name="home"
        options={{
          title: '想念',
          tabBarIcon: ({ focused }) => <TabGlyph glyph="💗" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="nai"
        options={{
          title: '小奈',
          tabBarIcon: ({ focused }) => <TabGlyph glyph="⭐" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="mine"
        options={{
          title: '我的',
          tabBarIcon: ({ focused }) => <TabGlyph glyph="😊" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

// Colorful glyph icons; unfocused ones fade instead of tinting (emoji can't tint).
function TabGlyph({ glyph, focused }: { glyph: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.45 }}>{glyph}</Text>;
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.card,
    borderTopWidth: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: 64,
    paddingBottom: 8,
    paddingTop: 8,
    ...shadow,
    shadowOffset: { width: 0, height: -4 },
  },
});
