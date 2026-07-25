import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Device, ScanMode } from 'react-native-ble-plx';
import { bleInitError, getBleManager, requestBlePermissions } from '../ring/bleManager';
import { RingConnectionState } from '../ring/RingSource';
import { ringService, useRingService } from '../ring/ringService';
import {
  Button,
  Card,
  CardTitle,
  Chip,
  PageTitle,
  RingMascot,
  Screen,
  Spinner,
  Sticker,
} from '../ui/kit';
import { colors } from '../ui/theme';

const SCAN_MS = 30000;
const NAME_FILTER = 'ring'; // only devices whose advertised name contains "ring"

export type Found = { id: string; name: string; rssi: number | null };

type Props = {
  /**
   * 'connect' is the onboarding flow (scan → connect → proceed). 'manage' is the
   * 连接 tab: when already connected it offers disconnect / rescan.
   */
  mode?: 'connect' | 'manage';
  /** Called in connect mode once the ring is connected and the user proceeds. */
  onConnected?: () => void | Promise<void>;
  /** Kept for compatibility; the 连接 tab no longer renders a back button. */
  onClose?: () => void;
};

/**
 * Scan + connect UI for the voice ring. The live connection, double-press
 * handling and auto recording upload are owned by ringService, so they keep
 * running after this screen unmounts. Scanning is the only transient state here.
 */
export default function RingConnectScreen({ mode = 'connect', onConnected }: Props) {
  const manager = getBleManager();
  const unavailable = !manager;

  const svc = useRingService();
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<Found[]>([]);
  const [scanError, setScanError] = useState<string | null>(bleInitError());
  const [proceeding, setProceeding] = useState(false);

  const foundRef = useRef<Map<string, Found>>(new Map());
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const error = scanError ?? svc.error;

  useEffect(() => {
    // Auto-start scanning when no ring is connected yet, so a fresh launch or a
    // disconnect immediately looks for the ring again.
    if (!unavailable && !svc.connectedId) {
      void startScan();
    }
    // Only tear down the scan — the ring connection must survive navigation so
    // background double-press + auto-upload keep running.
    return () => {
      if (scanTimer.current) clearTimeout(scanTimer.current);
      manager?.stopDeviceScan();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopScan = () => {
    if (scanTimer.current) {
      clearTimeout(scanTimer.current);
      scanTimer.current = null;
    }
    manager?.stopDeviceScan();
    setScanning(false);
  };

  const startScan = async () => {
    if (!manager) return;
    setScanError(null);
    ringService.setError(null);

    const ok = await requestBlePermissions();
    if (!ok) {
      setScanError('蓝牙权限被拒绝，无法扫描');
      return;
    }
    const btState = await manager.state();
    if (btState !== 'PoweredOn') {
      setScanError(`蓝牙未开启（当前状态：${btState}）`);
      return;
    }

    foundRef.current.clear();
    setDevices([]);
    setScanning(true);
    ringService.addLog('开始扫描…');
    manager.startDeviceScan(
      null,
      { allowDuplicates: true, scanMode: ScanMode.LowLatency },
      (err, device: Device | null) => {
        if (err) {
          setScanError(err.message);
          stopScan();
          return;
        }
        if (!device) return;
        const name = device.name ?? device.localName ?? '';
        if (!name.toLowerCase().includes(NAME_FILTER)) return; // name=ring filter
        if (foundRef.current.has(device.id)) return;
        const found: Found = { id: device.id, name, rssi: device.rssi ?? null };
        foundRef.current.set(device.id, found);
        setDevices(Array.from(foundRef.current.values()));
      },
    );

    scanTimer.current = setTimeout(() => {
      stopScan();
      ringService.addLog(`扫描结束，找到 ${foundRef.current.size} 个戒指`);
      void startScan();
    }, SCAN_MS);
  };

  const connect = async (dev: Found) => {
    stopScan();
    await ringService.connect(dev.id, dev.name);
  };

  // Disconnect AND forget the persisted ring, so the app won't auto-reconnect.
  const disconnectCurrent = async () => {
    await ringService.forget();
  };

  // Disconnect the current ring and immediately scan for a different one.
  const rescanForNew = async () => {
    await ringService.forget();
    if (!unavailable) void startScan();
  };

  // Connect mode: proceed once the ring is connected (connection stays alive).
  const proceed = async () => {
    if (!onConnected || !svc.connectedId) return;
    stopScan();
    setScanError(null);
    setProceeding(true);
    try {
      await onConnected();
    } catch (e: any) {
      setScanError(e?.message ?? '出错了');
    } finally {
      setProceeding(false);
    }
  };

  const connected = !!svc.connectedId;
  const subtitle =
    mode === 'connect'
      ? '扫描附近的戒指 · 连接后即可进入配对'
      : connected
        ? '戒指已连接 · 双击戒指即可给 TA 传递想念'
        : '连接你的 WhisperRing，让想念随时被记录与回应';

  return (
    <Screen>
      <PageTitle title={mode === 'connect' ? '连接戒指' : '我的戒指'} subtitle={subtitle} mascot />

      {unavailable ? (
        <Card tint="butter">
          <CardTitle icon="⚠️">蓝牙不可用</CardTitle>
          <Text style={styles.mono}>{error ?? '当前运行环境没有原生蓝牙模块。'}</Text>
          <Text style={styles.note}>
            react-native-ble-plx 需要 development build：{'\n'}
            运行 <Text style={styles.mono}>npx expo run:android</Text>
            （Expo Go 不支持 BLE）。
          </Text>
        </Card>
      ) : (
        <>
          {/* Connected ring management (manage mode) */}
          {mode === 'manage' && connected && (
            <Card style={{ overflow: 'visible' }}>
              <Sticker kind="star" size={22} rotate={12} style={{ position: 'absolute', top: -10, right: 12 }} />
              <View style={styles.deviceRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.deviceName}>{svc.connectedName || '戒指'}</Text>
                  <Text style={styles.mono}>MAC: {svc.connectedId}</Text>
                  <View style={styles.chips}>
                    <Chip label="已连接" tone="mint" />
                    <Chip label={`双击 ${svc.doubleCount}`} tone="brand" />
                  </View>
                </View>
                <RingMascot size={64} />
              </View>
              <Button title="断开当前戒指" variant="soft" onPress={disconnectCurrent} />
              <Button title="重新扫描连接新的" onPress={rescanForNew} />
            </Card>
          )}

          {(!connected || mode === 'connect') && (
            <>
              <Button
                title={scanning ? '扫描中… 点击停止' : '🛰️ 扫描设备'}
                onPress={scanning ? stopScan : startScan}
                variant={scanning ? 'soft' : 'filled'}
              />
              {scanning && (
                <View style={styles.scanRow}>
                  <Spinner />
                  <Text style={styles.note}>正在扫描附近的 BLE 设备…</Text>
                </View>
              )}

              <Card>
                <CardTitle icon="📡">设备列表（{devices.length}）</CardTitle>
                {devices.length === 0 && !scanning && (
                  <Text style={styles.note}>暂无设备，点击“扫描设备”开始。</Text>
                )}
                {devices.map((d) => {
                  const isConnected = svc.connectedId === d.id;
                  const isConnecting = svc.state === 'connecting' && !svc.connectedId;
                  return (
                    <View key={d.id} style={styles.deviceItem}>
                      <Text style={styles.deviceName}>{d.name || '(无名)'}</Text>
                      <Text style={styles.mono}>MAC: {d.id}</Text>
                      <View style={styles.chips}>
                        {d.rssi != null && (
                          <Chip label={`RSSI ${d.rssi}`} tone={d.rssi > -70 ? 'mint' : 'butter'} />
                        )}
                        {isConnected && <Chip label="已连接" tone="mint" />}
                      </View>
                      {isConnected ? (
                        <Button title="断开" onPress={disconnectCurrent} variant="soft" />
                      ) : (
                        <Button
                          title={isConnecting ? '连接中…' : '连接'}
                          onPress={() => connect(d)}
                          disabled={isConnecting}
                        />
                      )}
                    </View>
                  );
                })}
              </Card>
            </>
          )}

          {mode === 'connect' && connected && (
            <Button
              title={proceeding ? '处理中…' : '戒指已连接 · 下一步：与另一半配对'}
              onPress={proceed}
              disabled={proceeding}
            />
          )}

          <Card tint="brand">
            <View style={styles.statusBar}>
              <Text style={styles.statusText}>连接状态：{stateLabel(svc.state)}</Text>
              <Text style={styles.statusText}>双击计数：{svc.doubleCount}</Text>
            </View>
          </Card>

          {error && <Text style={styles.error}>⚠️ {error}</Text>}
        </>
      )}
    </Screen>
  );
}

function stateLabel(s: RingConnectionState): string {
  return s === 'connected' ? '已连接' : s === 'connecting' ? '连接中' : '未连接';
}

const styles = StyleSheet.create({
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  deviceName: { fontSize: 20, fontWeight: '800', color: colors.ink },
  mono: { fontFamily: 'monospace', fontSize: 12, color: colors.inkSoft, marginTop: 4 },
  chips: { flexDirection: 'row', marginVertical: 8 },
  scanRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  note: { fontSize: 13, color: colors.inkSoft, marginTop: 4 },
  deviceItem: {
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    paddingTop: 12,
    marginTop: 12,
  },
  statusBar: { flexDirection: 'row', justifyContent: 'space-between' },
  statusText: { color: colors.brandDeep, fontWeight: '600', fontSize: 13 },
  error: { color: colors.danger, marginTop: 4 },
});
