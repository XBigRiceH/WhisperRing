import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '../services';
import { saveSession } from '../store/session';
import { Button, Card, CardTitle, Field, PageTitle, Screen, Spinner, TagToggle } from '../ui/kit';
import { colors } from '../ui/theme';

// key 必须与后端 companion.TRAIT_LABELS 对齐
const TRAITS: { key: string; label: string }[] = [
  { key: 'gentle', label: '温柔' },
  { key: 'clingy', label: '黏人' },
  { key: 'witty', label: '幽默' },
  { key: 'cold', label: '高冷' },
  { key: 'caring', label: '体贴' },
  { key: 'playful', label: '俏皮' },
];
const GENDERS = [
  { key: 'female', label: '女性' },
  { key: 'male', label: '男性' },
  { key: 'neutral', label: '不设定' },
];

/** 捏一个TA — name / gender / traits / free-form intro for the AI companion. */
export default function CompanionSetupScreen({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [gender, setGender] = useState('female');
  const [traits, setTraits] = useState<string[]>(['gentle']);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const toggle = (k: string) =>
    setTraits((t) => (t.includes(k) ? t.filter((x) => x !== k) : [...t, k]));

  const create = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const c = await api.createCompanion({ name: name.trim() || 'TA', gender, traits });
      await saveSession({ coupleId: c.coupleId, mode: 'ai', companionName: c.name });
      onDone();
    } catch (e: any) {
      setMsg(e?.message ?? '创建失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <PageTitle
        title="捏一个 TA"
        subtitle="给你的 AI 虚拟伙伴命名，设定性格"
        mascot
        sticker="heart"
      />

      <Card>
        <CardTitle icon="🌸">1. 给 TA 起个名字吧</CardTitle>
        <Field value={name} onChangeText={setName} placeholder="给 TA 起个可爱的名字~" maxLength={12} />
      </Card>

      <Card>
        <CardTitle icon="🍀">2. 性别</CardTitle>
        <View style={styles.row}>
          {GENDERS.map((g) => (
            <TagToggle key={g.key} label={g.label} active={gender === g.key} onPress={() => setGender(g.key)} />
          ))}
        </View>
      </Card>

      <Card>
        <CardTitle icon="💗">3. 性格（可多选）</CardTitle>
        <View style={styles.row}>
          {TRAITS.map((t) => (
            <TagToggle key={t.key} label={t.label} active={traits.includes(t.key)} onPress={() => toggle(t.key)} />
          ))}
        </View>
      </Card>

      <Button title="✨ 就捏 TA 了，开始聊天" disabled={busy} onPress={create} />
      {busy && <Spinner />}
      {msg && <Text style={styles.err}>{msg}</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  err: { color: colors.danger, marginTop: 4, textAlign: 'center' },
});
