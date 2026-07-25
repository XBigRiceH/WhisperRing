import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { SinianWidget } from './SinianWidget';
import { loadWidgetData } from './types';

const WIDGET_NAME = 'Sinian';

/**
 * Headless handler the OS invokes for widget lifecycle events (added, periodic
 * update, resized, clicked). It reads the last-persisted payload and renders the
 * widget. Registered at app entry via registerWidgetTaskHandler (Android only).
 */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  if (props.widgetInfo.widgetName !== WIDGET_NAME) return;
  const data = await loadWidgetData();
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
    case 'WIDGET_CLICK':
      props.renderWidget(<SinianWidget data={data} />);
      break;
    default:
      break;
  }
}
