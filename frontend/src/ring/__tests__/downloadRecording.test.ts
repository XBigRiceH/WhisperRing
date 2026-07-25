import { decodePacket, RingCommands, AudioFrame } from '../../protocol';
import {
  RecordingDownloader,
  RecordingResult,
  AutoRecordingReceiver,
} from '../downloadRecording';

// Drives RecordingDownloader with synthetic ring events (no BLE / React Native).
// Verifies the command sequence (0x0501 count -> 0x0509 quick extract of the
// latest index) and frame assembly into the raw Speex `.bin`.

function frame(fileIndex: number, frameOffset: number, data: number[], isEnd: boolean): AudioFrame {
  return { fileIndex, frameOffset, frameSize: data.length, isEnd, data: new Uint8Array(data) };
}

describe('RecordingDownloader', () => {
  it('counts, quick-extracts the latest index, and assembles frames', async () => {
    const sent: Uint8Array[] = [];
    const progress: number[] = [];
    const dl = new RecordingDownloader(
      (p) => {
        sent.push(p);
      },
      (p) => progress.push(p.received),
    );

    const done = dl.start();

    // First write must be the count request.
    expect(decodePacket(sent[0]).command).toBe(RingCommands.AUDIO_COUNT_REQ);

    // Three recordings -> latest index is 2.
    dl.feed({ type: 'audioFileCount', count: 3 });
    const quick = decodePacket(sent[1]);
    expect(quick.command).toBe(RingCommands.AUDIO_QUICK_EXTRACT_START);
    expect(quick.body[5]).toBe(2); // file_index tail byte (u16 err + u32 index)

    dl.feed({ type: 'audioFileInfo', info: { fileIndex: 2, recordTime: 1700000000, dataSize: 6 } });
    dl.feed({ type: 'audioFrame', frame: frame(2, 0, [1, 2, 3, 4], false) });
    dl.feed({ type: 'audioFrame', frame: frame(2, 4, [5, 6], true) });

    const r: RecordingResult = await done;
    expect(r.fileIndex).toBe(2);
    expect(r.recordTime).toBe(1700000000);
    expect(Array.from(r.data)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(progress[progress.length - 1]).toBe(6);
  });

  it('rejects when the device has no recordings', async () => {
    const dl = new RecordingDownloader(() => {});
    const done = dl.start();
    dl.feed({ type: 'audioFileCount', count: 0 });
    await expect(done).rejects.toThrow('设备中没有录音');
  });

  it('rejects when the owner reports a transport error', async () => {
    const dl = new RecordingDownloader(() => {});
    const done = dl.start();
    dl.fail('写失败: boom');
    await expect(done).rejects.toThrow('写失败: boom');
  });

  it('ignores events after settling', async () => {
    const dl = new RecordingDownloader(() => {});
    const done = dl.start();
    dl.feed({ type: 'audioFileCount', count: 0 });
    await expect(done).rejects.toThrow();
    // A late frame must not throw or re-settle.
    expect(() => dl.feed({ type: 'audioFrame', frame: frame(0, 0, [1], true) })).not.toThrow();
  });
});

describe('AutoRecordingReceiver', () => {
  it('captures an unsolicited frame stream without sending any command', () => {
    let started = false;
    let completed: RecordingResult | null = null;
    const rx = new AutoRecordingReceiver({
      onStart: () => {
        started = true;
      },
      onComplete: (r) => {
        completed = r;
      },
    });

    expect(rx.isActive).toBe(false);
    rx.feed({ type: 'audioFrame', frame: frame(5, 0, [10, 20, 30], false) });
    expect(started).toBe(true);
    expect(rx.isActive).toBe(true);
    rx.feed({ type: 'audioFrame', frame: frame(5, 3, [40, 50], true) });

    expect(completed).not.toBeNull();
    expect(completed!.fileIndex).toBe(5);
    expect(completed!.recordTime).toBeNull();
    expect(Array.from(completed!.data)).toEqual([10, 20, 30, 40, 50]);
    // Resets so the next auto-upload is captured fresh.
    expect(rx.isActive).toBe(false);
  });

  it('captures two consecutive recordings', () => {
    const results: RecordingResult[] = [];
    const rx = new AutoRecordingReceiver({ onComplete: (r) => results.push(r) });

    rx.feed({ type: 'audioFrame', frame: frame(1, 0, [1, 2], true) });
    rx.feed({ type: 'audioFrame', frame: frame(2, 0, [3, 4, 5], true) });

    expect(results.map((r) => r.fileIndex)).toEqual([1, 2]);
    expect(Array.from(results[1].data)).toEqual([3, 4, 5]);
  });

  it('adopts record_time when metadata precedes the stream', () => {
    let completed: RecordingResult | null = null;
    const rx = new AutoRecordingReceiver({ onComplete: (r) => (completed = r) });
    rx.feed({ type: 'audioFileInfo', info: { fileIndex: 9, recordTime: 1700000123, dataSize: 2 } });
    rx.feed({ type: 'audioFrame', frame: frame(9, 0, [7, 8], true) });
    expect(completed!.recordTime).toBe(1700000123);
  });
});
