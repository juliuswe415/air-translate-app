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
    setDebugLogs((prev) => [{ time, message }, ...prev].slice(0, 80));
  };

  useEffect(() => {
    if (!roomId) {
      debug('No roomId, skipping socket init');
      return;
    }

    const socketUrl = process.env.NEXT_PUBLIC_URL_SOCKET;
    debug(`Room: ${roomId}`);
    debug(`Target language: ${lang}`);
    debug(`NEXT_PUBLIC_URL_SOCKET: ${socketUrl || 'MISSING'}`);

    if (!socketUrl) {
      debug('ERROR: NEXT_PUBLIC_URL_SOCKET is missing');
      return;
    }

    socket.current = io(socketUrl, {
      transports: ['websocket'],
      withCredentials: true,
    });

    socket.current.on('connect', () => {
      debug(`Socket connected: ${socket.current.id}`);
      socket.current.emit('join', roomId);
      debug(`Emitted join: ${roomId}`);
    });

    socket.current.on('connect_error', (error: any) => {
      debug(`Socket connect_error: ${error?.message || String(error)}`);
    });

    socket.current.on('disconnect', (reason: string) => {
      debug(`Socket disconnected: ${reason}`);
    });

    socket.current.onAny((event: string, ...args: any[]) => {
      debug(`Socket event received: ${event}`);
    });

    const init = async () => {
      try {
        debug('Requesting microphone permission...');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        const tracks = stream.getAudioTracks();
        debug(`Microphone stream ready. Audio tracks: ${tracks.length}`);

        for (const track of tracks) {
          debug(`Track: label="${track.label}", enabled=${track.enabled}, state=${track.readyState}`);
          track.enabled = false;
        }

        localStreamRef.current = stream;

        debug('Creating AudioContext with sampleRate 16000...');
        const audioCtx = new AudioContext({ sampleRate: 16000 });
        audioCtxRef.current = audioCtx;
        debug(`AudioContext state: ${audioCtx.state}, sampleRate: ${audioCtx.sampleRate}`);

        debug('Loading /recorder-worklet.js...');
        await audioCtx.audioWorklet.addModule('/recorder-worklet.js');
        debug('Audio worklet loaded');

        const source = audioCtx.createMediaStreamSource(stream);
        const worklet = new AudioWorkletNode(audioCtx, 'mic-processor');
        source.connect(worklet);
        debug('Audio worklet connected');

        let buffer: Float32Array[] = [];
        const chunkSize = 4096;
        let chunkCount = 0;

        worklet.port.onmessage = (event: any) => {
          const audioData: Float32Array = event.data.data;

          const micState = (document?.getElementById('mic') as HTMLInputElement)?.value;
          if (micState === '1') {
            buffer.push(audioData);

            const total = buffer.reduce((a, arr) => a + arr.length, 0);
            if (total >= chunkSize) {
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
                  debug(`Emitted audio-chunk #${chunkCount}, bytes=${int16.buffer.byteLength}`);
                }
              } else {
                debug(`WARNING: audio chunk ready but socket not connected`);
              }
            }
          }
        };

        socket.current.on('new-peer', async (peerId: string) => {
          debug(`New peer: ${peerId}`);
          const pc = createPeer(peerId, true, stream);
          peersRef.current[peerId] = pc;
        });

        socket.current.on('peer-disconnect', (peerId: string) => {
          debug(`Peer disconnected: ${peerId}`);

          if (peersRef.current[peerId]) {
            peersRef.current[peerId].close();
            delete peersRef.current[peerId];
          }

          const el = document.getElementById(`audio-${peerId}`);
          if (el) el.remove();
        });

        socket.current.on('stt-text', (props: any) => {
          debug(`Received stt-text: ${props?.text || JSON.stringify(props)}`);
          setCaptions((prev) => [props, ...prev]);
        });

        socket.current.on('tts-audio', ({ audio, format }: any) => {
          debug(`Received tts-audio: format=${format}, base64 length=${audio?.length || 0}`);

          const audioBlob = new Blob([Uint8Array.from(atob(audio), (c) => c.charCodeAt(0))], {
            type: `audio/${format}`,
          });

          const url = URL.createObjectURL(audioBlob);
          const audioEl = new Audio(url);

          audioEl
            .play()
            .then(() => debug('TTS audio playback started'))
            .catch((error) => debug(`TTS audio playback error: ${error?.message || String(error)}`));
        });
      } catch (error: any) {
        debug(`INIT ERROR: ${error?.message || String(error)}`);
      }
    };

    init();

    return () => {
      debug('Cleaning up room connection');

      if (socket.current) socket.current.disconnect();
      audioCtxRef.current?.close();

      for (const key in peersRef.current) {
        peersRef.current[key].close();
      }
    };
  }, [roomId]);

  const onToggleMic = async () => {
    debug(`Mic toggle clicked. Current micEnabled=${micEnabled}`);

    if (!localStreamRef.current) {
      debug('ERROR: localStreamRef is missing; microphone not initialized');
      return;
    }

    const newState = !micEnabled;
    setMicEnabled(newState);

    if (audioCtxRef.current?.state === 'suspended') {
      debug('AudioContext suspended, resuming...');
      await audioCtxRef.current.resume();
      debug(`AudioContext state after resume: ${audioCtxRef.current.state}`);
    }

    for (const track of localStreamRef.current.getAudioTracks()) {
      track.enabled = newState;
      debug(`Track "${track.label}" enabled=${track.enabled}, state=${track.readyState}`);
    }

    if (!newState) {
      debug(`Emitting audio-stop. roomId=${roomId}, lang=${lang}`);
      socket.current?.emit('audio-stop', { roomId, lang });
    } else {
      debug('Mic started. Speak now.');
    }
  };

  const createPeer = (peerId: string, initiator: boolean, stream: MediaStream) => {
    debug(`Creating RTCPeerConnection for peer=${peerId}, initiator=${initiator}`);

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    for (const track of stream.getTracks()) {
      pc.addTrack(track, stream);
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        debug(`Sending ICE candidate to ${peerId}`);

        socket.current.emit('signal', {
          target: peerId,
          data: { candidate: e.candidate },
        });
      }
    };

    pc.ontrack = (e) => {
      debug(`Received remote audio track from ${peerId}`);

      const remoteStream = e.streams[0];
      const audio = document.createElement('audio');
      audio.id = `audio-${peerId}`;
      audio.autoplay = false;
      audio.srcObject = remoteStream;
      document.body.appendChild(audio);
    };

    if (initiator) {
      pc.createOffer().then((offer) => {
        debug(`Created offer for ${peerId}`);

        pc.setLocalDescription(offer);
        socket.current.emit('signal', {
          target: peerId,
          data: { sdp: offer },
        });
      });
    }

    return pc;
  };

  return { onToggleMic, micEnabled, captions, debugLogs };
}
