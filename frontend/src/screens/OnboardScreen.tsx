import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../services';
import { saveSession } from '../store/session';
import { Button, Card, Spinner } from '../ui/kit';
import CompanionSetupScreen from './CompanionSetupScreen';
import RingConnectScreen from './RingConnectScreen';

export default function OnboardScreen({
  navigate,
  initialStep = 0,
}: {
  navigate: (s: string) => void;
  /** Where to resume: 0 nickname, 1 connect ring, 2 pair. */
  initialStep?: number;
}) {
  const [step, setStep] = useState(initialStep); // 0 nickname, 1 connect ring, 2 pair
  const [partnerKind, setPartnerKind] = useState<null | 'ai' | 'human'>(null);
  const [nickname, setNickname] = useState('');
  const [invite, setInvite] = useState<string | null>(null);
  const [inputCode, setInputCode] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(block: () => Promise<void>) {
    setBusy(true);
    setMsg(null);
    try {
      await block();
    } catch (e: any) {
      setMsg(e?.message ?? '出错了');
    } finally {
      setBusy(false);
    }
  }

  // Step 1: reuse the BLE test page to scan + connect a ring. The connection is
  // owned by ringService, so it stays alive (double-press + auto-upload keep
  // running in the background) after we move on to pairing and the home screen.
  if (step === 1) {
    return (
      <RingConnectScreen
        mode="connect"
        onConnected={async () => {
          // No server-side ring binding: whichever ring the user connects to
          // over BLE is the one in use, and 思念 pushes are scoped to the user
          // (not the ring), so we just move on to pairing once connected.
          setStep(2);
        }}
      />
    );
  }

  // AI path: hand off to the persona setup screen once chosen.
  if (step === 2 && partnerKind === 'ai') {
    return <CompanionSetupScreen onDone={() => navigate('home')} />;
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.h1}>想念 · WhisperRing</Text>
      <Text style={styles.h2}>{step === 0 ? '第一步：取个昵称' : '第三步：选择你的另一半'}</Text>
      {step === 0 && <Text style={styles.sub}>连接戒指、与 TA 结缘，只需几步</Text>}

      {step === 2 && partnerKind === null && (
        <>
          <Text style={styles.sub}>你想和谁一起用这枚戒指？</Text>
          <Button title="💗 和 AI 恋人" onPress={() => setPartnerKind('ai')} />
          <Button title="👫 和真人另一半" variant="outline" onPress={() => setPartnerKind('human')} />
        </>
      )}

      {step === 0 && (
        <>
          <TextInput style={styles.input} placeholder="你的昵称" value={nickname} onChangeText={setNickname} />
          <Button
            title="下一步：连接戒指"
            disabled={busy}
            onPress={() =>
              run(async () => {
                const r = await api.devLogin(nickname.trim() || '用户');
                api.token = r.token;
                await saveSession({ userId: r.userId, token: r.token, nickname: r.nickname ?? undefined });
                setStep(1);
              })
            }
          />
        </>
      )}

      {step === 2 && partnerKind === 'human' && (
        <>
          <Card>
            <Text style={styles.cardTitle}>A · 生成邀请码给对方</Text>
            <Button title="生成邀请码" disabled={busy} onPress={() => run(async () => setInvite((await api.invite()).code))} />
            {invite && <Text style={styles.code}>{invite}</Text>}
          </Card>
          <Card>
            <Text style={styles.cardTitle}>B · 输入对方的邀请码</Text>
            <TextInput
              style={styles.input}
              placeholder="邀请码"
              autoCapitalize="characters"
              value={inputCode}
              onChangeText={(t) => setInputCode(t.toUpperCase())}
            />
            <Button
              title="接受配对（结缘）"
              disabled={busy || !inputCode.trim()}
              onPress={() =>
                run(async () => {
                  const c = await api.accept(inputCode.trim());
                  await saveSession({ coupleId: c.coupleId, mode: 'human' });
                  navigate('home');
                })
              }
            />
          </Card>
          <Button
            title="我已在另一台完成配对 · 刷新"
            variant="outline"
            disabled={busy}
            onPress={() =>
              run(async () => {
                const c = await api.myCouple();
                await saveSession({ coupleId: c.coupleId, mode: 'human' });
                navigate('home');
              })
            }
          />
        </>
      )}

      {busy && (
        <View style={{ marginTop: 12 }}>
          <Spinner />
        </View>
      )}
      {msg && <Text style={styles.err}>{msg}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 64, gap: 8, backgroundColor: '#FFF5F8', flexGrow: 1 },
  h1: { fontSize: 28, fontWeight: '700', color: '#8A3A57' },
  h2: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  sub: { fontSize: 13, color: '#9A6B7C', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#E0C3CE',
    borderRadius: 10,
    padding: 12,
    marginVertical: 6,
    backgroundColor: 'white',
  },
  cardTitle: { fontSize: 15, fontWeight: '600', marginBottom: 8 },
  code: { fontSize: 32, fontWeight: '700', textAlign: 'center', letterSpacing: 4, marginTop: 8, color: '#E5688F' },
  err: { color: '#C0392B', marginTop: 12 },
});
