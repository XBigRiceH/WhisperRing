import React from 'react';
import RingConnectScreen from '../../screens/RingConnectScreen';

/**
 * 连接 tab: manage the connected ring (disconnect / rescan) or scan + connect a
 * new one when none is connected.
 */
export default function RingTab() {
  return <RingConnectScreen mode="manage" />;
}
