'use client';
import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

type DebugEntry = {
  time: string;
  message: string;
};

export function useWebRTC(roomId: string, lang: string) {
  const socket = useRef<any>(null);
  const peersRef = useRef<{ [id: string]: RTCPeerConnection }>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const [micEnabled, setMicEnabled] = useState(false);
  const [captions, setCaptions] = useState<any[]>([]);
  const [debugLogs, setDebugLogs] = useState<DebugEntry[]>([]);

  const debug = (message: string) => {
    const time = new Date().toLocaleTimeString();
    console.log(`[AirTranslate debug] ${message}`);
    setDebugLogs((prev) => [{ time, message }, ...prev].slice(0, 100));
  };

  useEffect(() => {
    if (!roomId) {
      debug('No roomId');
      return;
    }

    const socketUrl = process.env.NEXT_PUBLIC_URL_SOCKET;

    debug(`Room: ${roomId}`);
    debug(`Language: ${lang}`);
    debug(`Socket URL: ${socketUrl || 'MISSING'}`);

    if (!socketUrl) {
      debug('ERROR: NEXT_PUBLIC_URL_SOCKET missing');
      return;
    }

    socket.current = io(socketUrl, {
      transports: ['websocket'],
      withCredentials: true,
    });

    socket.current.on('connect', () => {
      debug(`Socket connected: ${socket.current.id}`);
      socket.current.emit('join', roomId);
      debug(`Join emitted: ${roomId}`);
    });

    socket.current.on('connect_error', (err: any) => {
      debug(`Socket connect_error: ${err?.message || String(err)}`);
    });

    socket.current.on('disconnect', (reason: string) => {
      debug(`Socket disconnected: ${reason}`);
    });

    socket.current.onAny((event: string) => {
      debug(`Socket event: ${event}`);
    });

    const init = async () => {
      try {
        debug('Requesting microphone');

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

        debug('Microphone granted');

        for (const track of stream.getAudioTracks()) {
          debug(`Track: ${track.label}`);
          track.enabled = false;
        }

        localStreamRef.current = stream;

        const audioCtx = new AudioContext({
          sampleRate: 16000,
        });

        audioCtxRef.current = audioCtx;

        debug(`AudioContext: ${audioCtx.state}`);

        await audioCtx.audioWorklet.addModule('/recorder-worklet.js');

        debug('Audio worklet loaded');

        const source = audioCtx.createMediaStreamSource(stream);

        const worklet = new AudioWorkletNode(audioCtx, 'mic-processor');

        source.connect(worklet);

        debug('Worklet connected');

        let buffer: Float32Array[] = [];
        let chunkCount = 0;

        worklet.port.onmessage = (event: any) => {
          const audioData: Float32Array = event.data.data;

          const micState = (document.getElementById('mic') as HTMLInputElement)?.value;

          if (micState === '1') {
            buffer.push(audioData);

            const total = buffer.reduce((a, arr) => a + arr.length, 0);

            if (total >= 4096) {
              const merged = new Float32Array(total);

              let offset = 0;

              for (const arr of buffer) {
                merged.set(arr, offset);
                offset += arr.length;
              }

              buffer = [];

              const int16 = new Int16Array(merged.length);

              for (let i = 0; i < merged.length; i++) {
                const s = Math.max(-1, Math.min(1, merged[i]));
                int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
              }

              chunkCount += 1;

              if (socket.current?.connected) {
                socket.current.emit('audio-chunk', int16.buffer);

                if (chunkCount <= 5 || chunkCount % 20 === 0) {
                  debug(`audio-chunk #${chunkCount} (${int16.buffer.byteLength} bytes)`);
                }
              } else {
                debug('WARNING: socket not connected');
              }
            }
          }
        };

        socket.current.on('stt-text', (props: any) => {
          debug(`stt-text: ${props?.text || ''}`);
          setCaptions((prev) => [props, ...prev]);
        });

        socket.current.on('tts-audio', ({ audio, format }: any) => {
          debug(`tts-audio received (${format})`);

          const audioBlob = new Blob(
            [Uint8Array.from(atob(audio), (c) => c.charCodeAt(0))],
            {
              type: `audio/${format}`,
            },
          );

          const url = URL.createObjectURL(audioBlob);

          const audioEl = new Audio(url);

          audioEl
            .play()
            .then(() => debug('Audio playback started'))
            .catch((err) => debug(`Audio playback error: ${err?.message || String(err)}`));
        });
      } catch (err: any) {
        debug(`INIT ERROR: ${err?.message || String(err)}`);
      }
    };

    init();

    return () => {
      debug('Cleanup');

      socket.current?.disconnect();

      audioCtxRef.current?.close();

      for (const key in peersRef.current) {
        peersRef.current[key].close();
      }
    };
  }, [roomId, lang]);

  const onToggleMic = async () => {
    debug(`Toggle mic. Current=${micEnabled}`);

    if (!localStreamRef.current) {
      debug('ERROR: no local stream');
      return;
    }

    const next = !micEnabled;

    setMicEnabled(next);

    if (audioCtxRef.current?.state === 'suspended') {
      debug('Resuming AudioContext');
      await audioCtxRef.current.resume();
      debug(`AudioContext resumed: ${audioCtxRef.current.state}`);
    }

    for (const track of localStreamRef.current.getAudioTracks()) {
      track.enabled = next;
      debug(`Track enabled=${track.enabled}`);
    }

    if (!next) {
      debug(`audio-stop emitted room=${roomId} lang=${lang}`);

      socket.current?.emit('audio-stop', {
        roomId,
        lang,
      });
    } else {
      debug('Mic ON');
    }
  };

  return {
    onToggleMic,
    micEnabled,
    captions,
    debugLogs,
  };
}
